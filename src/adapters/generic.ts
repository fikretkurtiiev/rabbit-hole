import { elementOf, markdownOf, previousInDocument, textOf, themeFromDocument } from './shared';
import type { SiteAdapter } from './types';

const ASSISTANT =
  '[data-message-author-role="assistant"], [data-role="assistant"], .font-claude-response, .markdown, .prose';
const USER = '[data-message-author-role="user"], [data-role="user"], [data-testid="user-message"]';

/** Best-effort fallback when a site adapter cannot find its elements. Degrades, never crashes. */
export const genericAdapter: SiteAdapter = {
  id: 'generic',
  matches: () => true,
  getConversationId: (url) => `${url.hostname}${url.pathname}`,
  getContentRoot: () => document.querySelector<HTMLElement>('main') ?? document.body,

  findMessageElement(node) {
    const el = elementOf(node);
    if (!el || el.closest(USER)) return null;
    let message = el.closest<HTMLElement>(ASSISTANT);
    while (message?.parentElement?.closest(ASSISTANT)) message = message.parentElement.closest<HTMLElement>(ASSISTANT);
    return message ?? null;
  },

  listAssistantMessages() {
    return Array.from(document.querySelectorAll<HTMLElement>(ASSISTANT)).filter(
      (el) => !el.parentElement?.closest(ASSISTANT) && !el.closest(USER),
    );
  },

  getMessageRole(el) {
    if (el.closest(USER)) return 'user';
    return el.closest(ASSISTANT) ? 'assistant' : null;
  },

  isStreaming: (el) => el.closest('[data-is-streaming="true"], .result-streaming') !== null,
  getMessageMarkdown: markdownOf,
  getPrecedingUserMessage: (el) => textOf(previousInDocument(el, USER)),
  getThemeHint: themeFromDocument,
};
