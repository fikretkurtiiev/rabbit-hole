import '@/ui/styles.css';
import katexStyles from 'virtual:katex-styles';
import { createRoot, type Root } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { adapterForUrl, withFallback } from '@/adapters';
import type { SiteAdapter } from '@/adapters/types';
import { request } from '@/messaging/client';
import { ContentMessageSchema } from '@/messaging/contracts';
import type { Settings } from '@/settings/schema';
import { loadSettings, onSettingsChanged } from '@/settings/storage';
import { anchorRegistry } from '@/ui/anchorRegistry';
import { App } from '@/ui/App';
import { useUiStore, type DiveTarget, type Rect } from '@/ui/store';
import { sendTurn } from '@/ui/threadActions';
import { createAnchorManager, setupNativeHighlights } from './anchorManager';
import { buildThreadInput, conversationKey } from './dive';
import { createHoverController } from './hover';
import { getSelectionRange } from './selection';
import { findDivableMessage } from './targets';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',

  async main(ctx) {
    const site = adapterForUrl(new URL(location.href));
    if (!site) return;
    try {
      await start(ctx, withFallback(site));
    } catch (error) {
      // The extension must degrade, never break the host page.
      console.warn('[rabbit-hole] failed to start', error);
    }
  },
});

function computeTheme(settings: Settings, adapter: SiteAdapter): 'light' | 'dark' {
  if (settings.appearance !== 'host') return settings.appearance;
  return adapter.getThemeHint() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function rectOf(target: DiveTarget): Rect {
  const rect = target.kind === 'block' ? target.element.getBoundingClientRect() : target.range.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function centreRect(): Rect {
  return { x: window.innerWidth / 2 - 200, y: window.innerHeight / 4, width: 0, height: 0 };
}

async function start(ctx: ContentScriptContext, adapter: SiteAdapter) {
  let settings = await loadSettings();
  const enabled = () => settings.sites[adapter.id as keyof Settings['sites']] ?? true;
  const store = useUiStore.getState;
  const nativeHighlights = setupNativeHighlights();

  let reactRoot: Root | null = null;
  const ui = await createShadowRootUi(ctx, {
    name: 'rabbit-hole-root',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    css: katexStyles,
    // Keep keystrokes in our popovers from triggering host shortcuts.
    isolateEvents: true,
    onMount(container) {
      reactRoot = createRoot(container);
      reactRoot.render(
        <App
          nativeHighlights={nativeHighlights}
          getButtonOffset={(type) => adapter.buttonOffset?.(type) ?? { x: 0, y: 0 }}
          onDive={(target) => void dive(target)}
          onButtonPointerEnter={() => hover.buttonEnter()}
          onButtonPointerLeave={() => hover.buttonLeave()}
          onThreadDeleted={(id) => {
            store().closePopover(id);
            anchors.removeThread(id);
          }}
        />,
      );
      return reactRoot;
    },
    onRemove(root) {
      root?.unmount();
    },
  });
  ui.mount();
  const shadowRoot = ui.shadow;

  const anchors = createAnchorManager({ adapter, shadowRoot, nativeHighlights });
  const hover = createHoverController({ adapter, getSettings: () => settings, isEnabled: enabled });
  hover.observe(shadowRoot);

  // ---------- Theme ----------
  const applyTheme = () => store().setTheme(computeTheme(settings, adapter));
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-mode', 'data-theme', 'style'] });
  const media = matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', applyTheme);

  // ---------- Opening threads ----------
  function openThread(threadId: string, initialRect?: Rect) {
    const geometry = anchorRegistry.get(threadId);
    const rect = initialRect ?? (geometry?.getRect() ? rectFromDom(geometry.getRect()!) : centreRect());
    store().openPopover({ id: threadId, kind: 'thread', initialRect: rect, returnFocus: document.activeElement });
  }

  async function dive(target: DiveTarget) {
    store().setDiveTarget(null);
    const initialRect = rectOf(target);
    try {
      const status = await request({ type: 'getStatus' });
      if (!status.hasKey) {
        store().openPopover({ id: 'onboarding', kind: 'onboarding', initialRect, returnFocus: document.activeElement });
        return;
      }
      const input = buildThreadInput(target, adapter);
      if (!input) return;
      const thread = await request({ type: 'createThread', input });
      document.getSelection()?.removeAllRanges();
      store().setThreadState(thread.id, { thread, messages: [] });
      anchors.addThread(thread);
      openThread(thread.id, initialRect);
      sendTurn(thread.id); // Stream the intro.
    } catch (error) {
      console.warn('[rabbit-hole] could not start a dive', error);
    }
  }

  // ---------- Selection ----------
  let selectionTimer: number | undefined;
  const evaluateSelection = () => {
    if (!enabled()) return;
    const range = getSelectionRange(shadowRoot);
    const current = store().diveTarget;
    if (!range || !range.toString().trim()) {
      if (current?.kind === 'selection') store().setDiveTarget(null);
      return;
    }
    const startMessage = findDivableMessage(range.startContainer, adapter);
    const endMessage = findDivableMessage(range.endContainer, adapter);
    if (!startMessage || startMessage !== endMessage) {
      if (current?.kind === 'selection') store().setDiveTarget(null);
      return;
    }
    store().setDiveTarget({ kind: 'selection', range, messageEl: startMessage });
  };
  const scheduleSelection = () => {
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(evaluateSelection, 120);
  };
  ctx.addEventListener(document, 'selectionchange', scheduleSelection);
  ctx.addEventListener(document, 'pointerup', scheduleSelection, { capture: true });

  // ---------- Clicking a highlight reopens its thread ----------
  ctx.addEventListener(document, 'click', (event: MouseEvent) => {
    if (!enabled() || event.button !== 0) return;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return;
    const origin = event.composedPath()[0];
    if (origin instanceof Element && origin.closest('a, button, input, textarea, select, [role="button"], [data-rh-dive]')) return;
    if (origin instanceof Element && origin.closest('[role="dialog"]') && !origin.closest('[data-rh-role]')) return;
    const threadId = anchors.hitTest(event.clientX, event.clientY);
    if (threadId) openThread(threadId);
  });

  // ---------- Conversation lifecycle ----------
  let detachRoot: (() => void) | null = null;
  let mutationObserver: MutationObserver | null = null;
  let loadToken = 0;

  async function loadConversation() {
    const token = ++loadToken;
    for (const popover of store().popovers) store().closePopover(popover.id);
    store().setDiveTarget(null);
    anchors.clear();

    detachRoot?.();
    mutationObserver?.disconnect();
    if (!enabled()) return;

    const contentRoot = adapter.getContentRoot();
    if (contentRoot) {
      detachRoot = hover.observe(contentRoot);
      mutationObserver = new MutationObserver(() => anchors.schedule());
      mutationObserver.observe(contentRoot, { childList: true, subtree: true, characterData: true });
    }

    const conversationId = conversationKey(adapter, new URL(location.href));
    const threads = await request({ type: 'listThreads', site: adapter.id, conversationId }).catch(() => []);
    if (token !== loadToken) return;
    anchors.setThreads(threads);
  }

  ctx.addEventListener(window, 'wxt:locationchange', () => void loadConversation());
  await loadConversation();

  // Nested anchors live in popover answers: re-anchor when thread messages render.
  const unsubscribe = useUiStore.subscribe((state, prev) => {
    if (state.threads !== prev.threads || state.popovers.length !== prev.popovers.length) anchors.schedule();
  });

  const stopSettings = onSettingsChanged((next) => {
    const wasEnabled = enabled();
    settings = next;
    applyTheme();
    if (wasEnabled !== enabled()) void loadConversation();
  });

  // ---------- Messages from the background (context menu) and toolbar popup ----------
  const onMessage = (raw: unknown) => {
    const parsed = ContentMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    if (parsed.data.type === 'contextMenuDive') {
      evaluateSelection();
      const target = store().diveTarget;
      if (target?.kind === 'selection') void dive(target);
    } else {
      const { id } = parsed.data;
      anchorRegistry.get(id)?.reveal();
      openThread(id);
    }
  };
  browser.runtime.onMessage.addListener(onMessage);

  ctx.onInvalidated(() => {
    browser.runtime.onMessage.removeListener(onMessage);
    unsubscribe();
    stopSettings();
    themeObserver.disconnect();
    media.removeEventListener('change', applyTheme);
    mutationObserver?.disconnect();
    detachRoot?.();
    hover.destroy();
    anchors.destroy();
    ui.remove();
  });
}

function rectFromDom(rect: DOMRect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
