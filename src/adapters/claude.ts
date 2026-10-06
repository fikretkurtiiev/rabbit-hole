import { elementOf, markdownOf, previousInDocument, textOf, themeFromDocument } from './shared';
import type { SiteAdapter } from './types';

const ASSISTANT = '.font-claude-response, .font-claude-message, [data-testid="assistant-message"]';
const USER = '[data-testid="user-message"]';

export const claudeAdapter: SiteAdapter = {
  id: 'claude',

  matches: (url) => url.hostname === 'claude.ai',

  getConversationId(url) {
    const match = /\/(?:chat|share)\/([\w-]+)/.exec(url.pathname);
    return match?.[1] ?? null;
  },

  getContentRoot: () => document.querySelector<HTMLElement>('main') ?? document.body,

  findMessageElement(node) {
    const el = elementOf(node);
    if (!el || el.closest(USER)) return null;
    // The outermost matching element is the whole response (inner .font-claude-response may be nested).
    let message = el.closest<HTMLElement>(ASSISTANT);
    while (message?.parentElement?.closest(ASSISTANT)) {
      message = message.parentElement.closest<HTMLElement>(ASSISTANT);
    }
    return message ?? null;
  },

  listAssistantMessages() {
    return Array.from(document.querySelectorAll<HTMLElement>(ASSISTANT)).filter(
      (el) => !el.parentElement?.closest(ASSISTANT),
    );
  },

  getMessageRole(el) {
    if (el.closest(USER)) return 'user';
    if (el.closest(ASSISTANT)) return 'assistant';
    return null;
  },

  isStreaming: (el) => el.closest('[data-is-streaming="true"]') !== null,

  getMessageMarkdown: markdownOf,

  getPrecedingUserMessage(el) {
    return textOf(previousInDocument(el, USER));
  },

  getThemeHint: themeFromDocument,

  buttonOffset(type) {
    return type === 'code' ? { x: 0, y: 36 } : { x: 0, y: 0 };
  },

  codeLanguage(pre) {
    const label = pre.parentElement?.querySelector('.text-text-500, [class*="text-xs"]')?.textContent?.trim().toLowerCase();
    return label && /^[a-z0-9+#-]{1,20}$/.test(label) ? label : null;
  },
};
