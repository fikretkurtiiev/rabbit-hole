import { elementOf, markdownOf, previousInDocument, textOf, themeFromDocument } from './shared';
import type { SiteAdapter } from './types';

const ASSISTANT = '[data-message-author-role="assistant"]';
const USER = '[data-message-author-role="user"]';
const CONTENT = '.markdown';

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',

  matches: (url) => url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com',

  getConversationId(url) {
    // /c/<id>, /g/<gpt>/c/<id>, /share/<id>
    const match = /\/(?:c|share)\/([\w-]+)/.exec(url.pathname);
    return match?.[1] ?? null;
  },

  getContentRoot: () => document.querySelector<HTMLElement>('main') ?? null,

  findMessageElement(node) {
    const el = elementOf(node);
    const message = el?.closest<HTMLElement>(ASSISTANT);
    if (!message) return null;
    return message.querySelector<HTMLElement>(CONTENT) ?? message;
  },

  listAssistantMessages() {
    return Array.from(document.querySelectorAll<HTMLElement>(ASSISTANT)).map(
      (message) => message.querySelector<HTMLElement>(CONTENT) ?? message,
    );
  },

  getMessageRole(el) {
    const role = el.closest('[data-message-author-role]')?.getAttribute('data-message-author-role');
    return role === 'assistant' || role === 'user' ? role : null;
  },

  isStreaming(el) {
    if (el.closest('.result-streaming') || el.querySelector('.result-streaming')) return true;
    // While generating, the composer shows a stop button and the last message is the live one.
    const stop = document.querySelector('[data-testid="stop-button"]');
    if (!stop) return false;
    const messages = this.listAssistantMessages();
    return messages.at(-1) === el;
  },

  getMessageMarkdown: markdownOf,

  getPrecedingUserMessage(el) {
    const user = previousInDocument(el, USER);
    return textOf(user?.querySelector('.whitespace-pre-wrap') ?? user);
  },

  getThemeHint: themeFromDocument,

  buttonOffset(type) {
    // Code blocks have a sticky header with a Copy button in the top-right corner.
    return type === 'code' ? { x: 0, y: 40 } : { x: 0, y: 0 };
  },

  codeLanguage(pre) {
    // The header above the code shows the language name.
    const header = pre.querySelector(':scope > div > div:first-child, :scope > div:first-child');
    const label = header?.textContent?.trim().split(/\s/)[0]?.toLowerCase();
    return label && /^[a-z0-9+#-]{1,20}$/.test(label) ? label : null;
  },
};
