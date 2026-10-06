import type { BlockType } from '@/settings/schema';

export interface ButtonOffset {
  /** Pixels to shift the Dive button left of the block's top-right corner. */
  x: number;
  y: number;
}

export interface SiteAdapter {
  id: string;
  matches(url: URL): boolean;
  /** Key for persisting threads. */
  getConversationId(url: URL): string | null;
  /** Container to observe for mutations and delegate pointer events from. */
  getContentRoot(): HTMLElement | null;
  /** The content element of the AI message containing a node (the element blocks live in). */
  findMessageElement(node: Node): HTMLElement | null;
  /** All assistant message content elements in document order; their index is the anchor hint. */
  listAssistantMessages(): HTMLElement[];
  getMessageRole(el: HTMLElement): 'user' | 'assistant' | null;
  /** Answer still being generated. */
  isStreaming(el: HTMLElement): boolean;
  /** Clean Markdown, no UI chrome. */
  getMessageMarkdown(el: HTMLElement): string;
  getPrecedingUserMessage(el: HTMLElement): string | null;
  getThemeHint(): 'light' | 'dark' | null;
  /** Keeps the Dive button clear of the host's own block controls (e.g. Copy on code blocks). */
  buttonOffset?(type: BlockType): ButtonOffset;
  /** Language hint for code blocks whose <code> has no language-* class. */
  codeLanguage?(pre: HTMLElement): string | null;
}
