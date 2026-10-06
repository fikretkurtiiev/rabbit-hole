import type { SiteAdapter } from '@/adapters/types';
import { resolveBlock, type DetectedBlock } from '@/blocks/detect';
import type { Settings } from '@/settings/schema';
import { MAX_THREAD_DEPTH } from '@/threads/model';
import { useUiStore } from '@/ui/store';
import { elementOf } from './selection';

export const POPOVER_MESSAGE_SELECTOR = '[data-rh-role="assistant"]';

/** The assistant message (host or popover answer) that contains `node`, if dives are allowed there. */
export function findDivableMessage(node: Node, adapter: SiteAdapter): HTMLElement | null {
  const el = elementOf(node);
  if (!el) return null;

  const root = el.getRootNode();
  if (root instanceof ShadowRoot) {
    const popoverMessage = el.closest<HTMLElement>(POPOVER_MESSAGE_SELECTOR);
    if (!popoverMessage) return null;
    const threadId = popoverMessage.dataset.rhThreadId ?? '';
    const depth = useUiStore.getState().threads[threadId]?.thread?.depth ?? MAX_THREAD_DEPTH;
    return depth < MAX_THREAD_DEPTH ? popoverMessage : null;
  }

  const message = adapter.findMessageElement(el);
  if (!message || adapter.getMessageRole(message) !== 'assistant' || adapter.isStreaming(message)) return null;
  return message;
}

export function findDivableBlock(node: Node, adapter: SiteAdapter, settings: Settings): (DetectedBlock & { messageEl: HTMLElement }) | null {
  const messageEl = findDivableMessage(node, adapter);
  const el = elementOf(node);
  if (!messageEl || !el) return null;
  const block = resolveBlock(el, messageEl);
  if (!block || !settings.hoverButtons[block.type]) return null;
  return { ...block, messageEl };
}

export function isPopoverMessage(el: HTMLElement): boolean {
  return el.matches(POPOVER_MESSAGE_SELECTOR) && el.getRootNode() instanceof ShadowRoot;
}
