import type { SiteAdapter } from '@/adapters/types';
import type { Settings } from '@/settings/schema';
import { useUiStore } from '@/ui/store';
import { findDivableBlock } from './targets';

const SHOW_DELAY_MS = 150;
const HIDE_DELAY_MS = 300;

interface HoverDeps {
  adapter: SiteAdapter;
  getSettings: () => Settings;
  isEnabled: () => boolean;
}

/**
 * Shows the shared Dive button over hovered blocks using one delegated pointerover listener per root.
 * The button stays while the pointer is on the block or the button, and hides 300 ms after leaving both.
 */
export function createHoverController({ adapter, getSettings, isEnabled }: HoverDeps) {
  let showTimer: number | undefined;
  let hideTimer: number | undefined;
  let pendingTarget: EventTarget | null = null;
  let raf = 0;
  let pointerDown = false;
  let onButton = false;
  const detachers: (() => void)[] = [];

  const store = () => useUiStore.getState();

  function cancelHide() {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }

  function scheduleHide() {
    window.clearTimeout(showTimer);
    if (hideTimer !== undefined) return;
    hideTimer = window.setTimeout(() => {
      hideTimer = undefined;
      if (!onButton && store().diveTarget?.kind === 'block') store().setDiveTarget(null);
    }, HIDE_DELAY_MS);
  }

  function evaluate(target: EventTarget | null) {
    if (!isEnabled() || pointerDown || !(target instanceof Node)) return;
    // A live text selection owns the button.
    if (store().diveTarget?.kind === 'selection') return;

    const block = findDivableBlock(target, adapter, getSettings());
    const current = store().diveTarget;
    if (!block) {
      if (current) scheduleHide();
      return;
    }
    cancelHide();
    if (current?.kind === 'block' && current.element === block.element) return;
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      if (pointerDown || store().diveTarget?.kind === 'selection') return;
      store().setDiveTarget({ kind: 'block', blockType: block.type, element: block.element, messageEl: block.messageEl });
    }, current ? 0 : SHOW_DELAY_MS);
  }

  const onPointerOver = (event: Event) => {
    pendingTarget = event.composedPath()[0] ?? event.target;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      evaluate(pendingTarget);
    });
  };

  const onPointerLeaveRoot = () => scheduleHide();

  const isOnDiveButton = (event: Event) =>
    event.composedPath().some((node) => node instanceof HTMLElement && node.dataset.rhDive !== undefined);

  const onPointerDown = (event: PointerEvent) => {
    if (isOnDiveButton(event)) return;
    pointerDown = true;
    window.clearTimeout(showTimer);
    if (store().diveTarget?.kind === 'block') store().setDiveTarget(null);
  };
  const onPointerUp = () => {
    pointerDown = false;
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);

  return {
    /** Attach delegated listeners to a root (the adapter's content root or our shadow root). */
    observe(root: HTMLElement | ShadowRoot) {
      root.addEventListener('pointerover', onPointerOver, { passive: true });
      root.addEventListener('pointerleave', onPointerLeaveRoot, { passive: true });
      const detach = () => {
        root.removeEventListener('pointerover', onPointerOver);
        root.removeEventListener('pointerleave', onPointerLeaveRoot);
      };
      detachers.push(detach);
      return detach;
    },
    buttonEnter() {
      onButton = true;
      cancelHide();
    },
    buttonLeave() {
      onButton = false;
      scheduleHide();
    },
    destroy() {
      detachers.forEach((d) => d());
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      cancelAnimationFrame(raf);
    },
  };
}

export type HoverController = ReturnType<typeof createHoverController>;
