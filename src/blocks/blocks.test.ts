import { listBlocks, resolveBlock } from './detect';
import { extractBlock, rangeToMarkdown } from './extract';
import { extractLatex } from './math';

function message(html: string): HTMLElement {
  document.body.innerHTML = `<div id="msg">${html}</div>`;
  return document.getElementById('msg')!;
}

const KATEX_INLINE =
  '<span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow>' +
  '<annotation encoding="application/x-tex">x^2</annotation></semantics></math></span>' +
  '<span class="katex-html" aria-hidden="true">x²</span></span>';

const KATEX_DISPLAY = `<span class="katex-display">${KATEX_INLINE.replace('x^2', '\\int_0^1 f(x)\\,dx')}</span>`;

describe('resolveBlock', () => {
  it('detects code blocks over the surrounding list', () => {
    const msg = message('<ul><li>Item<pre><code class="language-ts">let a</code></pre></li></ul>');
    const code = msg.querySelector('code')!;
    expect(resolveBlock(code, msg)?.type).toBe('code');
  });

  it('treats a paragraph inside a list item as the top-level list', () => {
    const msg = message('<ol><li><p>one</p><ul><li><p id="t">nested</p></li></ul></li></ol>');
    const block = resolveBlock(msg.querySelector('#t')!, msg);
    expect(block?.type).toBe('list');
    expect(block?.element.tagName).toBe('OL');
  });

  it('keeps inline math inside its paragraph but separates display math', () => {
    const msg = message(`<p id="p">Value ${KATEX_INLINE} here</p>${KATEX_DISPLAY}`);
    expect(resolveBlock(msg.querySelector('#p .katex')!, msg)?.type).toBe('paragraph');
    expect(resolveBlock(msg.querySelector('.katex-display .katex-html')!, msg)?.type).toBe('math');
  });

  it('detects tables from cells', () => {
    const msg = message('<table><tbody><tr><td id="c">1</td></tr></tbody></table>');
    expect(resolveBlock(msg.querySelector('#c')!, msg)?.type).toBe('table');
  });

  it('ignores nodes outside the message', () => {
    const msg = message('<p>in</p>');
    const outside = document.createElement('p');
    document.body.appendChild(outside);
    expect(resolveBlock(outside, msg)).toBeNull();
  });

  it('lists blocks by type in order', () => {
    const msg = message('<p>a</p><ul><li><p>skip</p></li></ul><p>b</p>');
    expect(listBlocks(msg, 'paragraph').map((p) => p.textContent)).toEqual(['a', 'b']);
  });
});

describe('extractors', () => {
  it('extracts code with its language', () => {
    const msg = message('<pre><div class="header">python<button>Copy</button></div><code class="language-python">print(1)\n</code></pre>');
    expect(extractBlock('code', msg.querySelector('pre')!)).toBe('```python\nprint(1)\n```');
  });

  it('extracts a GFM table', () => {
    const msg = message('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(extractBlock('table', msg.querySelector('table')!)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('recovers KaTeX LaTeX', () => {
    const msg = message(KATEX_DISPLAY);
    expect(extractBlock('math', msg.querySelector('.katex-display')!)).toBe('$$\n\\int_0^1 f(x)\\,dx\n$$');
  });

  it('recovers MathJax LaTeX from data-latex and assistive MathML', () => {
    const msg = message(
      '<mjx-container display="true" data-latex="E=mc^2"></mjx-container>' +
        '<mjx-container id="b"><mjx-assistive-mml><math><annotation encoding="application/x-tex">a+b</annotation></math></mjx-assistive-mml></mjx-container>',
    );
    expect(extractLatex(msg.querySelector('mjx-container')!)).toBe('E=mc^2');
    expect(extractLatex(msg.querySelector('#b')!)).toBe('a+b');
  });

  it('keeps inline math in paragraphs as $…$', () => {
    const msg = message(`<p>Square ${KATEX_INLINE} grows</p>`);
    expect(extractBlock('paragraph', msg.querySelector('p')!)).toBe('Square $x^2$ grows');
  });
});

describe('rangeToMarkdown', () => {
  it('keeps structure for a selection spanning elements', () => {
    const msg = message('<p id="a">First <strong>bold</strong></p><ul><li>item</li></ul>');
    const range = document.createRange();
    range.setStart(msg.querySelector('#a')!.firstChild!, 0);
    range.setEnd(msg.querySelector('li')!.firstChild!, 4);
    expect(rangeToMarkdown(range)).toBe('First **bold**\n\n- item');
  });

  it('fences a selection inside a code block', () => {
    const msg = message('<pre><code class="language-js">const a = 1;\nconst b = 2;</code></pre>');
    const text = msg.querySelector('code')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 12);
    expect(rangeToMarkdown(range)).toBe('```js\nconst a = 1;\n```');
  });
});
