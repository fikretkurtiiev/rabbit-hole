import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  PortClientMessageSchema,
  RequestSchema,
  STREAM_PORT_NAME,
  type Envelope,
  type PortServerMessage,
  type Request,
} from '@/messaging/contracts';
import { PROVIDER_ORIGINS, createProvider } from '@/providers';
import { ProviderError, USER_MESSAGES } from '@/providers/errors';
import type { ChatProvider } from '@/providers/types';
import type { ProviderId } from '@/settings/schema';
import { getApiKey } from '@/settings/keys';
import { loadSettings } from '@/settings/storage';
import { createThreadRepository } from '@/threads/repository';
import { createThreadFromInput, runTurn } from '@/threads/service';

const CONTEXT_MENU_ID = 'rabbit-hole-dive';

export default defineBackground(() => {
  // No essential state lives here: the background may be suspended at any time (service worker / event page).
  const repo = createThreadRepository();

  async function providerFor(id: ProviderId): Promise<ChatProvider | null> {
    const key = await getApiKey(id);
    if (!key) return null;
    const granted = await browser.permissions.contains({ origins: [PROVIDER_ORIGINS[id]] });
    if (!granted) {
      throw new ProviderError('no_key', 'Rabbit Hole needs permission to reach the provider API. Re-save your key in Settings.');
    }
    return createProvider(id, key);
  }

  async function handle(req: Request): Promise<unknown> {
    switch (req.type) {
      case 'getStatus': {
        const settings = await loadSettings();
        return {
          hasKey: Boolean(await getApiKey(settings.provider)),
          provider: settings.provider,
          model: settings.models[settings.provider],
        };
      }
      case 'listThreads':
        return repo.listThreads(req.site, req.conversationId);
      case 'getThread': {
        const thread = await repo.getThread(req.id);
        return thread ? { thread, messages: await repo.listMessages(req.id) } : null;
      }
      case 'createThread':
        return createThreadFromInput(repo, req.input, await loadSettings());
      case 'deleteThread':
        await repo.deleteThread(req.id);
        return null;
      case 'setThreadStatus':
        await repo.updateThread(req.id, { status: req.status });
        return null;
      case 'openOptions':
        await browser.runtime.openOptionsPage();
        return null;
      case 'testKey': {
        const provider = await providerFor(req.provider).catch(() => null);
        return provider ? provider.testKey() : 'no_key';
      }
      case 'listModels': {
        const provider = await providerFor(req.provider);
        return provider ? provider.listModels() : [];
      }
    }
  }

  browser.runtime.onMessage.addListener((raw: unknown, sender: Browser.runtime.MessageSender) => {
    // Only accept messages from our own extension contexts.
    if (sender.id !== browser.runtime.id) return undefined;
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    return handle(parsed.data).then(
      (data): Envelope => ({ ok: true, data }),
      (error: unknown): Envelope => ({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== STREAM_PORT_NAME || port.sender?.id !== browser.runtime.id) return;
    const controller = new AbortController();
    let disconnected = false;
    const emit = (message: PortServerMessage) => {
      if (!disconnected) port.postMessage(message);
    };
    port.onDisconnect.addListener(() => {
      disconnected = true;
      controller.abort();
    });
    port.onMessage.addListener((raw: unknown) => {
      const parsed = PortClientMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      if (parsed.data.type === 'abort') {
        controller.abort();
        return;
      }
      const { threadId, userText } = parsed.data;
      void (async () => {
        try {
          await runTurn(threadId, userText, {
            repo,
            settings: await loadSettings(),
            getProvider: (thread) => providerFor(thread.provider),
            emit,
            signal: controller.signal,
          });
        } catch (error) {
          const providerError = error instanceof ProviderError ? error : new ProviderError('unknown', USER_MESSAGES.unknown);
          emit({ type: 'error', code: providerError.code, message: providerError.message });
        }
      })();
    });
  });

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Dive into "%s"',
      contexts: ['selection'],
      documentUrlPatterns: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*'],
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || tab?.id === undefined) return;
    void browser.tabs.sendMessage(tab.id, { type: 'contextMenuDive' }, { frameId: info.frameId }).catch(() => {});
  });
});
