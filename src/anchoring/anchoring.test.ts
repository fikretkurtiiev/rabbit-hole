import { extractBlock } from '@/blocks/extract';
import { createBlockAnchor, hashContent, resolveBlockAnchor } from './blockAnchor';
import { createTextQuote, findTextQuote } from './textQuote';

function setup(html: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById('root')!;
}

function selectText(root: HTMLElement, text: string, occurrence = 0): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    let from = 0;
    for (let i = node.data.indexOf(text, from); i !== -1; i = node.data.indexOf(text, from)) {
      if (seen++ === occurrence) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + text.length);
        return range;
      }
      from = i + 1;
    }
  }
  throw new Error(`text not found: ${text}`);
}

describe('text quote anchors', () => {
  it('captures exact, prefix and suffix', () => {
    const root = setup('<p>The quick brown fox jumps over the lazy dog.</p>');
    const quote = createTextQuote(root, selectText(root, 'brown fox'));
    expect(quote).toEqual({ exact: 'brown fox', prefix: 'The quick ', suffix: ' jumps over the lazy dog.' });
  });

  it('works across element boundaries', () => {
    const root = setup('<p>alpha <b>beta</b> gamma</p>');
    const range = document.createRange();
    range.setStart(root.querySelector('p')!.firstChild!, 2);
    range.setEnd(root.querySelector('b')!.firstChild!, 2);
    expect(createTextQuote(root, range)?.exact).toBe('pha be');
  });

  it('disambiguates repeated text with context', () => {
    const root = setup('<p>one cat here.</p><p>two cat there.</p>');
    const quote = createTextQuote(root, selectText(root, 'cat', 1))!;
    const match = findTextQuote(root, quote)!;
    expect(match.fuzzy).toBe(false);
    expect(match.range.startContainer.textContent).toBe('two cat there.');
  });

  it('matches fuzzily when whitespace changed', () => {
    const root = setup('<p>hello   big\n world</p>');
    const match = findTextQuote(root, { exact: 'big world', prefix: 'hello ', suffix: '' })!;
    expect(match.fuzzy).toBe(true);
    expect(match.range.toString().replace(/\s+/g, ' ')).toBe('big world');
  });

  it('matches when the middle of a long quote changed', () => {
    const root = setup('<p>Gradient descent updates every weight slightly toward lower loss values.</p>');
    const match = findTextQuote(root, {
      exact: 'Gradient descent updates each weight slightly toward lower loss values.',
      prefix: '',
      suffix: '',
    });
    expect(match?.fuzzy).toBe(true);
  });

  it('returns null for orphaned quotes', () => {
    const root = setup('<p>nothing to see</p>');
    expect(findTextQuote(root, { exact: 'completely different text', prefix: '', suffix: '' })).toBeNull();
  });
});

describe('block anchors', () => {
  const extract = (type: Parameters<typeof extractBlock>[0], el: HTMLElement) => extractBlock(type, el);

  it('round-trips a block anchor', () => {
    const root = setup('<div class="m"><p>a</p><pre><code>x()</code></pre></div><div class="m"><pre><code>y()</code></pre></div>');
    const messages = Array.from(root.querySelectorAll<HTMLElement>('.m'));
    const pre = messages[1]!.querySelector('pre')!;
    const anchor = createBlockAnchor(1, 'code', pre, messages[1]!, extract('code', pre));
    expect(anchor.ordinal).toBe(0);
    expect(resolveBlockAnchor(messages, anchor, extract)?.element).toBe(pre);
  });

  it('finds a block that moved to another message by hash', () => {
    const root = setup('<div class="m"><pre><code>moved()</code></pre></div>');
    const messages = Array.from(root.querySelectorAll<HTMLElement>('.m'));
    const anchor = {
      kind: 'block' as const, messageIndex: 3, blockType: 'code' as const, ordinal: 2,
      contentHash: hashContent('```\nmoved()\n```'), firstLine: 'moved()',
    };
    expect(resolveBlockAnchor(messages, anchor, extract)?.fuzzy).toBe(false);
  });

  it('falls back to the first line when content changed', () => {
    const root = setup('<div class="m"><pre><code>def f():\n  return 2</code></pre></div>');
    const messages = Array.from(root.querySelectorAll<HTMLElement>('.m'));
    const anchor = {
      kind: 'block' as const, messageIndex: 0, blockType: 'code' as const, ordinal: 0,
      contentHash: 'deadbeef', firstLine: 'def f():',
    };
    expect(resolveBlockAnchor(messages, anchor, extract)?.fuzzy).toBe(true);
  });
});
