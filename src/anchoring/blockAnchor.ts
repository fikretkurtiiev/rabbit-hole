import { listBlocks } from '@/blocks/detect';
import type { BlockType } from '@/settings/schema';
import type { BlockAnchor } from './types';

/** FNV-1a 32-bit hash, hex encoded. Short and stable – only used to recognise block content. */
export function hashContent(text: string): string {
  let hash = 0x811c9dc5;
  const normalised = text.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < normalised.length; i++) {
    hash ^= normalised.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function firstLineOf(element: Element): string {
  return (element.textContent ?? '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 80) ?? '';
}

export function createBlockAnchor(
  messageIndex: number,
  type: BlockType,
  element: HTMLElement,
  messageRoot: Element,
  markdown: string,
): BlockAnchor {
  return {
    kind: 'block',
    messageIndex,
    blockType: type,
    ordinal: Math.max(0, listBlocks(messageRoot, type).indexOf(element)),
    contentHash: hashContent(markdown),
    firstLine: firstLineOf(element),
  };
}

export interface BlockMatch {
  element: HTMLElement;
  messageRoot: HTMLElement;
  fuzzy: boolean;
}

/**
 * Finds the block for an anchor. Order: same message + ordinal + hash, same message by hash,
 * any message by hash, then a block of the same type whose first line matches.
 */
export function resolveBlockAnchor(
  messages: HTMLElement[],
  anchor: BlockAnchor,
  extract: (type: BlockType, el: HTMLElement) => string,
): BlockMatch | null {
  const matchesHash = (el: HTMLElement) => hashContent(extract(anchor.blockType, el)) === anchor.contentHash;
  const hinted = messages[anchor.messageIndex];
  const ordered = hinted ? [hinted, ...messages.filter((m) => m !== hinted)] : messages;

  if (hinted) {
    const blocks = listBlocks(hinted, anchor.blockType);
    const byOrdinal = blocks[anchor.ordinal];
    if (byOrdinal && matchesHash(byOrdinal)) return { element: byOrdinal, messageRoot: hinted, fuzzy: false };
  }
  for (const messageRoot of ordered) {
    const found = listBlocks(messageRoot, anchor.blockType).find(matchesHash);
    if (found) return { element: found, messageRoot, fuzzy: false };
  }
  if (anchor.firstLine) {
    for (const messageRoot of ordered) {
      const found = listBlocks(messageRoot, anchor.blockType).find((el) => firstLineOf(el) === anchor.firstLine);
      if (found) return { element: found, messageRoot, fuzzy: true };
    }
  }
  return null;
}
