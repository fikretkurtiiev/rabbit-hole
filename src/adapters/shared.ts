import { htmlToMarkdown } from '@/blocks/markdown';

export function textOf(el: Element | null | undefined): string | null {
  const text = el?.textContent?.trim();
  return text ? text : null;
}

export function markdownOf(el: HTMLElement): string {
  return htmlToMarkdown(el);
}

export function themeFromDocument(): 'light' | 'dark' | null {
  const html = document.documentElement;
  if (html.classList.contains('dark') || html.dataset.mode === 'dark' || html.dataset.theme === 'dark') return 'dark';
  if (html.classList.contains('light') || html.dataset.mode === 'light' || html.dataset.theme === 'light') return 'light';
  return null;
}

/** Finds the nearest element matching `selector` that comes before `el` in document order. */
export function previousInDocument(el: Element, selector: string, root: ParentNode = document): Element | null {
  const all = Array.from(root.querySelectorAll(selector));
  let previous: Element | null = null;
  for (const candidate of all) {
    if (candidate.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) previous = candidate;
    else break;
  }
  return previous;
}

export function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}
