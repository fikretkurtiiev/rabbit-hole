import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { extractLatex, isDisplayMath } from './math';

/** Elements that are UI chrome rather than content (copy buttons, toolbars, icons). */
export const CHROME_SELECTOR = 'button, svg, [role="toolbar"], [aria-hidden="true"]:not(.katex-html *), .sr-only, script, style';

export function detectCodeLanguage(pre: Element): string {
  const code = pre.querySelector('code') ?? pre;
  for (const cls of Array.from(code.classList)) {
    const match = /^(?:language|lang)-(.+)$/.exec(cls);
    if (match?.[1]) return match[1];
  }
  return pre.getAttribute('data-language') ?? code.getAttribute('data-language') ?? '';
}

export function codeText(pre: Element): string {
  const code = pre.querySelector('code') ?? pre;
  return (code.textContent ?? '').replace(/\n$/, '');
}

export function fence(code: string, language: string): string {
  const longestRun = Math.max(2, ...Array.from(code.matchAll(/`+/g), (m) => m[0].length));
  const ticks = '`'.repeat(longestRun + 1);
  return `${ticks}${language}\n${code}\n${ticks}`;
}

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  service.use(gfm);

  service.addRule('math', {
    filter: (node) => node.nodeType === 1 && (node as Element).matches('.katex, mjx-container'),
    replacement: (_content, node) => {
      const el = node as Element;
      const latex = extractLatex(el);
      return isDisplayMath(el) ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`;
    },
  });

  service.addRule('display-math-wrapper', {
    filter: (node) => node.nodeType === 1 && (node as Element).matches('.katex-display'),
    replacement: (_content, node) => {
      const inner = (node as Element).querySelector('.katex');
      return `\n\n$$\n${extractLatex(inner ?? (node as Element))}\n$$\n\n`;
    },
  });

  service.addRule('code-block', {
    filter: (node) => node.nodeName === 'PRE',
    replacement: (_content, node) => {
      const pre = node as Element;
      return `\n\n${fence(codeText(pre), detectCodeLanguage(pre))}\n\n`;
    },
  });

  // Turndown pads list markers to 4 columns ("-   item"); use the compact form models and humans expect.
  service.addRule('list-item', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentNode as HTMLElement | null;
      let marker = '-';
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1);
        marker = `${start + Array.prototype.indexOf.call(parent.children, node)}.`;
      }
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${' '.repeat(marker.length + 1)}`);
      return `${marker} ${body.trimEnd()}${node.nextSibling ? '\n' : ''}`;
    },
  });

  service.remove((node) => node.nodeType === 1 && (node as Element).matches(CHROME_SELECTOR) && !(node as Element).closest('.katex'));
  return service;
}

let turndown: TurndownService | null = null;

/** Converts an element or fragment to Markdown without touching the original DOM. */
export function htmlToMarkdown(source: Node): string {
  turndown ??= createTurndown();
  const container = document.createElement('div');
  container.appendChild(source.cloneNode(true));
  return turndown.turndown(container).trim();
}
