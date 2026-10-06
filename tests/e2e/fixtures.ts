import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';

const EXTENSION_PATH = join(process.cwd(), '.output-e2e/chrome-mv3');

export const SITES = {
  chatgpt: { url: 'https://chatgpt.com/c/e2e-conversation', fixture: 'chatgpt' },
  claude: { url: 'https://claude.ai/chat/e2e-conversation', fixture: 'claude' },
} as const;

/** Anthropic-style SSE stream for a mocked intro answer. */
export function anthropicStream(text: string): string {
  const event = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return [
    event('message_start', {
      message: {
        id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [],
        stop_reason: null, stop_sequence: null, usage: { input_tokens: 321, output_tokens: 1 },
      },
    }),
    event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    ...text.split(/(?<= )/).map((part) => event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: part } })),
    event('content_block_stop', { index: 0 }),
    event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 42 } }),
    event('message_stop', {}),
  ].join('');
}

interface Fixtures {
  context: BrowserContext;
  background: Worker;
  /** Requests the extension sent to the (mocked) provider. */
  providerRequests: { url: string; body: string }[];
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    // Chrome for Testing ignores --load-extension, so load the unpacked build over CDP.
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--enable-unsafe-extension-debugging'],
    });
    const cdp = await context.browser()!.newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: EXTENSION_PATH });
    // Serve fixture pages on the real host names so the content script matches.
    for (const site of Object.values(SITES)) {
      const html = readFileSync(join(process.cwd(), 'tests/fixtures', site.fixture, 'conversation.html'), 'utf8');
      await context.route(`${new URL(site.url).origin}/**`, (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: html }),
      );
    }
    await use(context);
    await context.close();
  },

  background: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },

  providerRequests: async ({ context }, use) => {
    const requests: { url: string; body: string }[] = [];
    await context.route('https://api.anthropic.com/**', async (route) => {
      requests.push({ url: route.request().url(), body: route.request().postData() ?? '' });
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
        body: anthropicStream('A debounce wrapper delays calls until input settles for the given time.'),
      });
    });
    await use(requests);
  },
});

export async function setApiKey(background: Worker, key: string | null): Promise<void> {
  await background.evaluate(async (value) => {
    const { chrome } = globalThis as unknown as { chrome: { storage: { local: { set(items: object): Promise<void> } } } };
    await chrome.storage.local.set({ apiKeys: value ? { anthropic: value } : {} });
  }, key);
}

export { expect } from '@playwright/test';
