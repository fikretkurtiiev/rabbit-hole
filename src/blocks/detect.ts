import type { BlockType } from '@/settings/schema';
import { DISPLAY_MATH_SELECTOR } from './math';

export interface DetectedBlock {
  type: BlockType;
  element: HTMLElement;
}

export type EnabledBlocks = Record<BlockType, boolean>;

function closestWithin(start: Element, selector: string, root: Element): HTMLElement | null {
  const found = start.closest<HTMLElement>(selector);
  return found && root.contains(found) && found !== root ? found : null;
}

/** The outermost element matching `selector` between `start` and `root`. */
function outermostWithin(start: Element, selector: string, root: Element): HTMLElement | null {
  let current = closestWithin(start, selector, root);
  let outermost: HTMLElement | null = null;
  while (current) {
    outermost = current;
    current = current.parentElement ? closestWithin(current.parentElement, selector, root) : null;
  }
  return outermost;
}

/**
 * Resolves the block that contains `target` inside an assistant message.
 * Code and display math win over their containers; tables, blockquotes and top-level lists win over
 * the paragraphs inside them; inline math belongs to its paragraph.
 */
export function resolveBlock(target: Element, messageRoot: Element): DetectedBlock | null {
  if (!messageRoot.contains(target)) return null;

  const math = closestWithin(target, DISPLAY_MATH_SELECTOR, messageRoot);
  if (math) return { type: 'math', element: math };

  const code = closestWithin(target, 'pre', messageRoot);
  if (code) return { type: 'code', element: code };

  const containers: [BlockType, string][] = [
    ['table', 'table'],
    ['blockquote', 'blockquote'],
    ['list', 'ul, ol'],
  ];
  let best: DetectedBlock | null = null;
  for (const [type, selector] of containers) {
    const el = outermostWithin(target, selector, messageRoot);
    // Prefer the outermost container overall (e.g. a list inside a blockquote counts as the blockquote).
    if (el && (!best || el.contains(best.element))) best = { type, element: el };
  }
  if (best) return best;

  const paragraph = closestWithin(target, 'p', messageRoot);
  if (paragraph && paragraph.textContent?.trim()) return { type: 'paragraph', element: paragraph };
  return null;
}

/** All blocks of a type in a message, in document order. Used for ordinals in block anchors. */
export function listBlocks(messageRoot: Element, type: BlockType): HTMLElement[] {
  const selector: Record<BlockType, string> = {
    math: DISPLAY_MATH_SELECTOR,
    code: 'pre',
    table: 'table',
    blockquote: 'blockquote',
    list: 'ul, ol',
    paragraph: 'p',
  };
  return Array.from(messageRoot.querySelectorAll<HTMLElement>(selector[type])).filter((el) => {
    const resolved = resolveBlock(el, messageRoot);
    return resolved?.element === el && resolved.type === type;
  });
}

export function blockLabel(type: BlockType): string {
  const labels: Record<BlockType, string> = {
    code: 'code block',
    table: 'table',
    math: 'formula',
    paragraph: 'paragraph',
    list: 'list',
    blockquote: 'quote',
  };
  return labels[type];
}
