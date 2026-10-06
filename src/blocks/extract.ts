import type { BlockType } from '@/settings/schema';
import { codeText, detectCodeLanguage, fence, htmlToMarkdown } from './markdown';
import { extractLatex } from './math';

/** Extracts a block as Markdown suitable for the context packet. */
export function extractBlock(type: BlockType, element: Element, languageHint?: string): string {
  switch (type) {
    case 'code':
      return fence(codeText(element), detectCodeLanguage(element) || languageHint || '');
    case 'math': {
      const inner = element.matches('.katex, mjx-container') ? element : (element.querySelector('.katex, mjx-container') ?? element);
      return `$$\n${extractLatex(inner)}\n$$`;
    }
    default:
      return htmlToMarkdown(element);
  }
}

/** Converts a DOM selection range to Markdown, keeping code, tables and math structure. */
export function rangeToMarkdown(range: Range): string {
  const fragment = range.cloneContents();
  // A selection entirely inside one code block loses its <pre>; restore the fence.
  const startPre = (range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement
  )?.closest('pre');
  if (startPre) return fence(fragment.textContent ?? '', detectCodeLanguage(startPre));

  // A selection inside rendered math: recover the whole formula's source.
  const ancestor = range.commonAncestorContainer.parentElement?.closest('.katex, mjx-container');
  if (ancestor) return `$${extractLatex(ancestor)}$`;

  return htmlToMarkdown(fragment);
}
