import type { TextQuote } from './types';

export const CONTEXT_CHARS = 32;

interface TextIndex {
  text: string;
  nodes: Text[];
  /** Start offset of each node within `text`. */
  starts: number[];
}

function indexText(root: Node): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('script, style, .katex-html, mjx-container > :not(mjx-assistive-mml)')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += (node as Text).data;
  }
  return { text, nodes, starts };
}

function offsetOf(index: TextIndex, container: Node, offset: number): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const i = index.nodes.indexOf(container as Text);
    return i === -1 ? null : index.starts[i]! + offset;
  }
  // Element boundary: count text before the child at `offset`.
  const child = container.childNodes[offset];
  for (let i = 0; i < index.nodes.length; i++) {
    const node = index.nodes[i]!;
    if (child ? child === node || child.contains(node) || (child.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false) {
      return index.starts[i]!;
    }
  }
  return index.text.length;
}

function rangeFromOffsets(index: TextIndex, start: number, end: number): Range | null {
  const locate = (pos: number, preferNext: boolean): [Text, number] | null => {
    for (let i = 0; i < index.nodes.length; i++) {
      const nodeStart = index.starts[i]!;
      const node = index.nodes[i]!;
      const nodeEnd = nodeStart + node.data.length;
      if (pos < nodeEnd || (pos === nodeEnd && !preferNext)) return [node, pos - nodeStart];
    }
    const last = index.nodes.at(-1);
    return last ? [last, last.data.length] : null;
  };
  const startPos = locate(start, true);
  const endPos = locate(end, false);
  if (!startPos || !endPos) return null;
  const range = document.createRange();
  range.setStart(...startPos);
  range.setEnd(...endPos);
  return range;
}

/** Builds a W3C-style text quote selector for a range inside `root`. */
export function createTextQuote(root: Node, range: Range): TextQuote | null {
  const index = indexText(root);
  const start = offsetOf(index, range.startContainer, range.startOffset);
  const end = offsetOf(index, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return {
    exact: index.text.slice(start, end),
    prefix: index.text.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: index.text.slice(end, end + CONTEXT_CHARS),
  };
}

/** Collapses whitespace while remembering where each normalised char came from. */
function normalise(text: string): { text: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      out += ' ';
      lastWasSpace = true;
    } else {
      out += ch;
      lastWasSpace = false;
    }
    map.push(i);
  }
  map.push(text.length);
  return { text: out, map };
}

function allIndexesOf(haystack: string, needle: string): number[] {
  const result: number[] = [];
  if (!needle) return result;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) result.push(i);
  return result;
}

/** Number of trailing (or leading) chars two strings share – used to score context matches. */
function sharedSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function sharedPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

export interface QuoteMatch {
  range: Range;
  fuzzy: boolean;
}

/**
 * Finds a text quote inside `root`. Tries an exact match (disambiguated by prefix/suffix), then a
 * whitespace-insensitive match, then a head/tail match for quotes whose middle changed.
 */
export function findTextQuote(root: Node, quote: TextQuote): QuoteMatch | null {
  const index = indexText(root);
  const norm = normalise(index.text);
  const exact = normalise(quote.exact).text.trim();
  if (!exact) return null;
  const prefix = normalise(quote.prefix).text;
  const suffix = normalise(quote.suffix).text;

  const pick = (candidates: number[], length: number): number | null => {
    let best: number | null = null;
    let bestScore = -1;
    for (const start of candidates) {
      const score =
        sharedSuffix(norm.text.slice(Math.max(0, start - prefix.length), start), prefix) +
        sharedPrefix(norm.text.slice(start + length, start + length + suffix.length), suffix);
      if (score > bestScore) {
        best = start;
        bestScore = score;
      }
    }
    return best;
  };

  const toRange = (normStart: number, normEnd: number) =>
    rangeFromOffsets(index, norm.map[normStart]!, norm.map[normEnd - 1]! + 1);

  const exactRaw = allIndexesOf(index.text, quote.exact);
  if (exactRaw.length > 0) {
    const normCandidates = exactRaw.map((raw) => norm.map.findIndex((m) => m >= raw));
    const start = pick(normCandidates, exact.length);
    if (start !== null) {
      const raw = norm.map[start]!;
      const range = rangeFromOffsets(index, raw, raw + quote.exact.length);
      if (range) return { range, fuzzy: false };
    }
  }

  const normCandidates = allIndexesOf(norm.text, exact);
  if (normCandidates.length > 0) {
    const start = pick(normCandidates, exact.length)!;
    const range = toRange(start, start + exact.length);
    if (range) return { range, fuzzy: true };
  }

  // Head/tail fallback: the first and last few words still match, the middle was edited.
  if (exact.length >= 24) {
    const span = Math.min(16, Math.floor(exact.length / 3));
    const head = exact.slice(0, span);
    const tail = exact.slice(-span);
    for (const start of allIndexesOf(norm.text, head)) {
      const tailAt = norm.text.indexOf(tail, start + span);
      if (tailAt !== -1 && tailAt + span - start <= exact.length * 1.5) {
        const range = toRange(start, tailAt + span);
        if (range) return { range, fuzzy: true };
      }
    }
  }
  return null;
}
