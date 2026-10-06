interface ShadowRootWithSelection extends ShadowRoot {
  getSelection?: () => Selection | null;
}

/** Older browsers lack getComposedRanges even though the DOM typings declare it. */
function hasComposedRanges(selection: Selection): boolean {
  return typeof (selection as Partial<Selection>).getComposedRanges === 'function';
}

/**
 * Returns the current selection as a live Range, including selections inside our shadow root
 * (popover answers), using getComposedRanges where available.
 */
export function getSelectionRange(shadowRoot: ShadowRoot): Range | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    const inner = (shadowRoot as ShadowRootWithSelection).getSelection?.();
    if (inner && inner.rangeCount > 0 && !inner.isCollapsed) return inner.getRangeAt(0).cloneRange();
    return null;
  }
  if (hasComposedRanges(selection)) {
    const [composed] = selection.getComposedRanges({ shadowRoots: [shadowRoot] });
    if (!composed || composed.collapsed) return null;
    const range = document.createRange();
    range.setStart(composed.startContainer, composed.startOffset);
    range.setEnd(composed.endContainer, composed.endOffset);
    return range;
  }
  const inner = (shadowRoot as ShadowRootWithSelection).getSelection?.();
  if (inner && inner.rangeCount > 0 && !inner.isCollapsed) return inner.getRangeAt(0).cloneRange();
  return selection.getRangeAt(0).cloneRange();
}

export function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}
