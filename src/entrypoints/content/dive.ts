import { createBlockAnchor } from '@/anchoring/blockAnchor';
import { createTextQuote } from '@/anchoring/textQuote';
import type { Anchor } from '@/anchoring/types';
import type { SiteAdapter } from '@/adapters/types';
import { extractBlock, rangeToMarkdown } from '@/blocks/extract';
import type { NewThreadInput } from '@/messaging/contracts';
import type { FragmentType } from '@/settings/schema';
import { useUiStore, type DiveTarget } from '@/ui/store';
import { isPopoverMessage } from './targets';

export function conversationKey(adapter: SiteAdapter, url: URL): string {
  return adapter.getConversationId(url) ?? `path:${url.pathname}`;
}

function nodeRange(el: Element): Range {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

/** Turns a Dive button target into everything the background needs to create a thread. */
export function buildThreadInput(target: DiveTarget, adapter: SiteAdapter): NewThreadInput | null {
  const url = new URL(location.href);
  const fragmentType: FragmentType = target.kind === 'block' ? target.blockType : 'selection';
  const base = { site: adapter.id, conversationId: conversationKey(adapter, url), fragmentType };

  if (isPopoverMessage(target.messageEl)) {
    // Nested dive inside a popover answer.
    const threadId = target.messageEl.dataset.rhThreadId;
    const messageId = target.messageEl.dataset.rhMessageId;
    const state = threadId ? useUiStore.getState().threads[threadId] : undefined;
    const messages = state?.messages ?? [];
    const index = messages.findIndex((m) => m.id === messageId);
    if (!threadId || !messageId || index === -1 || !state?.thread) return null;

    const range = target.kind === 'block' ? nodeRange(target.element) : target.range;
    const quote = createTextQuote(target.messageEl, range);
    const fragmentMarkdown =
      target.kind === 'block' ? extractBlock(target.blockType, target.element) : rangeToMarkdown(target.range);
    if (!quote || !fragmentMarkdown) return null;
    const previousUser = messages.slice(0, index).reverse().find((m) => m.role === 'user');

    return {
      ...base,
      // Nested threads belong to the same page conversation as their root.
      conversationId: state.thread.conversationId,
      anchor: { kind: 'thread-message', messageId, quote },
      fragmentMarkdown,
      sourceMarkdown: messages[index]!.content,
      userPromptMarkdown: previousUser?.content ?? null,
      parentThreadId: threadId,
    };
  }

  const messages = adapter.listAssistantMessages();
  const messageIndex = Math.max(0, messages.indexOf(target.messageEl));
  let anchor: Anchor;
  let fragmentMarkdown: string;

  if (target.kind === 'block') {
    fragmentMarkdown = extractBlock(target.blockType, target.element, adapter.codeLanguage?.(target.element) ?? undefined);
    anchor = createBlockAnchor(messageIndex, target.blockType, target.element, target.messageEl, fragmentMarkdown);
  } else {
    fragmentMarkdown = rangeToMarkdown(target.range);
    const quote = createTextQuote(target.messageEl, target.range);
    if (!quote) return null;
    anchor = { kind: 'selection', messageIndex, quote };
  }
  if (!fragmentMarkdown.trim()) return null;

  return {
    ...base,
    anchor,
    fragmentMarkdown,
    sourceMarkdown: adapter.getMessageMarkdown(target.messageEl),
    userPromptMarkdown: adapter.getPrecedingUserMessage(target.messageEl),
  };
}
