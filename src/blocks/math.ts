/** Selectors for rendered math produced by KaTeX and MathJax. */
export const MATH_SELECTOR = '.katex, mjx-container';
export const DISPLAY_MATH_SELECTOR = '.katex-display, mjx-container[display="true"], mjx-container[display="block"]';

/** Recovers the LaTeX source of a rendered KaTeX or MathJax element. */
export function extractLatex(el: Element): string {
  const tex = el.querySelector('annotation[encoding="application/x-tex"]');
  if (tex?.textContent) return tex.textContent.trim();

  const mjx = el.closest('mjx-container') ?? el.querySelector('mjx-container');
  const dataLatex = mjx?.getAttribute('data-latex') ?? el.getAttribute('data-latex');
  if (dataLatex) return dataLatex.trim();

  // MathJax assistive MathML can carry a TeX annotation too.
  const assistive = mjx?.querySelector('mjx-assistive-mml annotation[encoding="application/x-tex"]');
  if (assistive?.textContent) return assistive.textContent.trim();

  const alt = mjx?.getAttribute('aria-label');
  if (alt) return alt.trim();
  return (el.textContent ?? '').trim();
}

export function isDisplayMath(el: Element): boolean {
  return el.matches(DISPLAY_MATH_SELECTOR) || el.closest(DISPLAY_MATH_SELECTOR) !== null;
}
