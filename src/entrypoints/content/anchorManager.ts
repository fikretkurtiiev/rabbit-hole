import { resolveBlockAnchor } from '@/anchoring/blockAnchor';
import { findTextQuote } from '@/anchoring/textQuote';
import type { SiteAdapter } from '@/adapters/types';
import { extractBlock } from '@/blocks/extract';
import { request } from '@/messaging/client';
import type { Thread } from '@/threads/model';
import { anchorRegistry } from '@/ui/anchorRegistry';
import { useUiStore, type AnchoredThread } from '@/ui/store';

const HIGHLIGHT_NAME = 'rabbit-hole';
const REANCHOR_DEBOUNCE_MS = 400;

/**
 * Registers the one document-level rule the CSS Custom Highlight API needs. It only styles our own
 * named highlight, so it cannot affect the host page. Returns false where unsupported.
 */
export function setupNativeHighlights(): boolean {
  if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') return false;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`::highlight(${HIGHLIGHT_NAME}) { background-color: rgb(251 146 60 / 0.28); }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return true;
  } catch {
    return false;
  }
}

interface Resolved {
  range?: Range;
  element?: HTMLElement;
  contextElement: Element;
}

interface AnchorManagerDeps {
  adapter: SiteAdapter;
  shadowRoot: ShadowRoot;
  nativeHighlights: boolean;
}

export function createAnchorManager({ adapter, shadowRoot, nativeHighlights }: AnchorManagerDeps) {
  let threads: Thread[] = [];
  let resolved = new Map<string, Resolved>();
  let timer: number | undefined;

  const extract = (type: Parameters<typeof extractBlock>[0], el: HTMLElement) =>
    extractBlock(type, el, adapter.codeLanguage?.(el) ?? undefined);

  function resolve(thread: Thread, messages: HTMLElement[]): Resolved | null {
    const { anchor } = thread;
    switch (anchor.kind) {
      case 'block': {
        const match = resolveBlockAnchor(messages, anchor, extract);
        return match ? { element: match.element, contextElement: match.messageRoot } : null;
      }
      case 'selection': {
        const hinted = messages[anchor.messageIndex];
        const ordered = hinted ? [hinted, ...messages.filter((m) => m !== hinted)] : messages;
        for (const message of ordered) {
          const match = findTextQuote(message, anchor.quote);
          if (match) return { range: match.range, contextElement: message };
        }
        return null;
      }
      case 'thread-message': {
        const el = shadowRoot.querySelector<HTMLElement>(`[data-rh-message-id="${CSS.escape(anchor.messageId)}"]`);
        if (!el) return null;
        const match = findTextQuote(el, anchor.quote);
        return match ? { range: match.range, contextElement: el } : null;
      }
    }
  }

  function render() {
    const anchored: AnchoredThread[] = [];
    const ranges: Range[] = [];
    anchorRegistry.clear();
    for (const [id, r] of resolved) {
      const getRect = () => (r.element ?? r.range)?.getBoundingClientRect() ?? null;
      anchorRegistry.set(id, {
        getRect,
        getClientRects: r.range ? () => Array.from(r.range!.getClientRects()) : undefined,
        contextElement: r.contextElement,
        reveal: () => (r.element ?? r.contextElement).scrollIntoView({ block: 'center', behavior: 'smooth' }),
      });
      anchored.push({ id, kind: r.element ? 'block' : 'text' });
      if (r.range) ranges.push(r.range);
    }
    if (nativeHighlights) CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    useUiStore.getState().setAnchored(anchored);
  }

  function reanchor() {
    const messages = adapter.listAssistantMessages();
    const next = new Map<string, Resolved>();
    for (const thread of threads) {
      const r = resolve(thread, messages);
      if (r) next.set(thread.id, r);

      // Only host anchors can be orphaned; popover anchors are simply hidden while the popover is closed.
      if (thread.anchor.kind === 'thread-message' || messages.length === 0) continue;
      const status = r ? 'active' : 'orphaned';
      if (thread.status !== status) {
        thread.status = status;
        void request({ type: 'setThreadStatus', id: thread.id, status }).catch(() => {});
      }
    }
    resolved = next;
    render();
  }

  return {
    setThreads(list: Thread[]) {
      threads = list;
      reanchor();
    },
    addThread(thread: Thread) {
      threads = [...threads.filter((t) => t.id !== thread.id), thread];
      reanchor();
    },
    removeThread(id: string) {
      threads = threads.filter((t) => t.id !== id && t.parentThreadId !== id);
      reanchor();
    },
    threads: () => threads,
    schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(reanchor, REANCHOR_DEBOUNCE_MS);
    },
    /** Thread whose fragment is under the given viewport point, preferring the deepest (most specific). */
    hitTest(x: number, y: number): string | null {
      const inside = (rect: DOMRect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      let hit: Thread | null = null;
      for (const thread of threads) {
        const r = resolved.get(thread.id);
        if (!r) continue;
        const rects = r.range ? Array.from(r.range.getClientRects()) : r.element ? [r.element.getBoundingClientRect()] : [];
        if (rects.some(inside) && (!hit || thread.depth > hit.depth || (r.range && !resolved.get(hit.id)?.range))) hit = thread;
      }
      return hit?.id ?? null;
    },
    clear() {
      threads = [];
      resolved.clear();
      render();
    },
    destroy() {
      window.clearTimeout(timer);
      if (nativeHighlights) CSS.highlights.delete(HIGHLIGHT_NAME);
      anchorRegistry.clear();
    },
  };
}

export type AnchorManager = ReturnType<typeof createAnchorManager>;
