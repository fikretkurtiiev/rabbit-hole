import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBlock } from '@/blocks/detect';
import { extractBlock } from '@/blocks/extract';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { adapterForUrl, withFallback } from './index';
import type { SiteAdapter } from './types';

function loadFixture(site: string): void {
  const html = readFileSync(join(process.cwd(), 'tests/fixtures', site, 'conversation.html'), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.className = doc.documentElement.className;
  for (const attr of Array.from(doc.documentElement.attributes)) document.documentElement.setAttribute(attr.name, attr.value);
  document.body.innerHTML = doc.body.innerHTML;
}

afterEach(() => {
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-mode');
});

describe('adapterForUrl', () => {
  it('picks the right adapter', () => {
    expect(adapterForUrl(new URL('https://chatgpt.com/c/abc'))?.id).toBe('chatgpt');
    expect(adapterForUrl(new URL('https://claude.ai/chat/123'))?.id).toBe('claude');
    expect(adapterForUrl(new URL('https://example.com'))).toBeNull();
  });
});

describe('ChatGPT adapter', () => {
  beforeEach(() => loadFixture('chatgpt'));

  it('parses conversation ids', () => {
    expect(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/c/68a1-b2'))).toBe('68a1-b2');
    expect(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/g/g-x/c/zz9'))).toBe('zz9');
    expect(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/'))).toBeNull();
  });

  it('finds assistant messages and roles', () => {
    const messages = chatgptAdapter.listAssistantMessages();
    expect(messages).toHaveLength(2);
    const code = document.querySelector('code')!;
    expect(chatgptAdapter.findMessageElement(code)).toBe(messages[0]);
    expect(chatgptAdapter.getMessageRole(messages[0]!)).toBe('assistant');
    expect(chatgptAdapter.findMessageElement(document.querySelector('.whitespace-pre-wrap')!)).toBeNull();
  });

  it('detects streaming and theme', () => {
    const [done, live] = chatgptAdapter.listAssistantMessages();
    expect(chatgptAdapter.isStreaming(done!)).toBe(false);
    expect(chatgptAdapter.isStreaming(live!)).toBe(true);
    expect(chatgptAdapter.getThemeHint()).toBe('dark');
  });

  it('returns the preceding user message', () => {
    const [, second] = chatgptAdapter.listAssistantMessages();
    expect(chatgptAdapter.getPrecedingUserMessage(second!)).toBe('And throttle?');
  });

  it('produces clean Markdown without UI chrome', () => {
    const md = chatgptAdapter.getMessageMarkdown(chatgptAdapter.listAssistantMessages()[0]!);
    expect(md).not.toContain('Copy code');
    expect(md).toContain('```typescript\nfunction debounce');
    expect(md).toContain('| Option | Default |');
    expect(md).toContain('$$\nT_{total} = n \\cdot t\n$$');
    expect(md).toContain('The delay is $t$ ms.');
  });

  it('resolves every block type from the fixture', () => {
    const message = chatgptAdapter.listAssistantMessages()[0]!;
    const types = ['strong', 'code', 'td', '.katex-display .katex-html', 'li p'].map(
      (selector) => resolveBlock(message.querySelector(selector)!, message)?.type,
    );
    expect(types).toEqual(['paragraph', 'code', 'table', 'math', 'list']);
    expect(extractBlock('code', message.querySelector('pre')!)).toMatch(/^```typescript\n/);
  });
});

describe('Claude adapter', () => {
  beforeEach(() => loadFixture('claude'));

  it('parses conversation ids', () => {
    expect(claudeAdapter.getConversationId(new URL('https://claude.ai/chat/1f2e-3d'))).toBe('1f2e-3d');
    expect(claudeAdapter.getConversationId(new URL('https://claude.ai/new'))).toBeNull();
  });

  it('finds messages, streaming state, user prompt and theme', () => {
    const [first, live] = claudeAdapter.listAssistantMessages();
    expect(claudeAdapter.listAssistantMessages()).toHaveLength(2);
    expect(claudeAdapter.findMessageElement(first!.querySelector('blockquote p')!)).toBe(first);
    expect(claudeAdapter.isStreaming(first!)).toBe(false);
    expect(claudeAdapter.isStreaming(live!)).toBe(true);
    expect(claudeAdapter.getPrecedingUserMessage(first!)).toBe("Explain Bayes' theorem");
    expect(claudeAdapter.getMessageRole(document.querySelector<HTMLElement>('[data-testid="user-message"] p')!)).toBe('user');
    expect(claudeAdapter.getThemeHint()).toBe('light');
  });

  it('resolves blocks and extracts LaTeX', () => {
    const message = claudeAdapter.listAssistantMessages()[0]!;
    expect(resolveBlock(message.querySelector('blockquote p')!, message)?.type).toBe('blockquote');
    expect(resolveBlock(message.querySelector('ol li')!, message)?.type).toBe('list');
    const math = resolveBlock(message.querySelector('.katex-html')!, message)!;
    expect(extractBlock(math.type, math.element)).toBe('$$\nP(A|B) = \\frac{P(B|A)P(A)}{P(B)}\n$$');
  });
});

describe('withFallback', () => {
  it('falls back to the generic adapter when the site adapter throws', () => {
    loadFixture('chatgpt');
    const broken: SiteAdapter = {
      ...chatgptAdapter,
      listAssistantMessages: () => {
        throw new Error('selector drift');
      },
    };
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(withFallback(broken).listAssistantMessages().length).toBeGreaterThan(0);
    debug.mockRestore();
  });
});
