/**
 * Live geometry of each thread's fragment, maintained by the content script's anchor manager.
 * Popovers read it to follow their fragment while the page scrolls.
 */
export interface AnchorGeometry {
  getRect(): DOMRect | null;
  /** Line boxes of a text fragment (for the overlay fallback when CSS highlights are unavailable). */
  getClientRects?(): DOMRect[];
  /** Element whose scroll ancestors should trigger repositioning. */
  contextElement: Element;
  /** Scrolls the fragment into view and returns focus there on close. */
  reveal(): void;
}

const registry = new Map<string, AnchorGeometry>();

export const anchorRegistry = {
  get: (threadId: string) => registry.get(threadId) ?? null,
  set: (threadId: string, geometry: AnchorGeometry) => registry.set(threadId, geometry),
  delete: (threadId: string) => registry.delete(threadId),
  clear: () => registry.clear(),
};
