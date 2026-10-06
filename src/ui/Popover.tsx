import { autoUpdate, computePosition, flip, offset, shift, size as sizeMw, type VirtualElement } from '@floating-ui/dom';
import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { request } from '@/messaging/client';
import { MAX_THREAD_DEPTH } from '@/threads/model';
import { anchorRegistry } from './anchorRegistry';
import { Composer } from './Composer';
import { HeaderButton } from './HeaderButton';
import { CloseIcon, DiveIcon, MinimiseIcon, PinIcon, TrashIcon } from './icons';
import { Onboarding } from './Onboarding';
import { fragmentLabel, useUiStore, type PopoverState } from './store';
import { abortTurn, loadThread, sendTurn } from './threadActions';
import { ThreadView } from './ThreadView';

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

interface PopoverProps {
  popover: PopoverState;
  onDeleted: (threadId: string) => void;
}

export function Popover({ popover, onDeleted }: PopoverProps) {
  const { id, kind, pinned, position, size, minimised, z } = popover;
  const state = useUiStore((s) => s.threads[id]);
  const updatePopover = useUiStore((s) => s.updatePopover);
  const focusPopover = useUiStore((s) => s.focusPopover);
  const closePopover = useUiStore((s) => s.closePopover);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (kind === 'thread' && !state?.thread) void loadThread(id);
  }, [id, kind, state?.thread]);

  useEffect(() => {
    if (!minimised) inputRef.current?.focus({ preventScroll: true });
  }, [minimised]);

  // Follow the fragment until the popover is pinned or dragged.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || minimised) return;
    if (pinned && position) {
      el.style.transform = `translate(${position.x}px, ${position.y}px)`;
      return;
    }
    const geometry = anchorRegistry.get(id);
    const { initialRect } = popover;
    const reference: VirtualElement = {
      // Looked up on every call: re-anchoring replaces registry entries as the host DOM changes.
      getBoundingClientRect: () =>
        anchorRegistry.get(id)?.getRect() ?? new DOMRect(initialRect.x, initialRect.y, initialRect.width, initialRect.height),
      contextElement: geometry?.contextElement,
    };
    const update = () =>
      void computePosition(reference, el, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [
          offset(8),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          sizeMw({
            padding: 8,
            apply: ({ availableHeight }) => {
              el.style.maxHeight = `${Math.max(240, availableHeight)}px`;
            },
          }),
        ],
      }).then(({ x, y }) => {
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      });
    return autoUpdate(reference, el, update);
  }, [id, pinned, position, minimised, popover]);

  // Persist user resizes.
  useEffect(() => {
    const el = ref.current;
    if (!el || minimised) return;
    const observer = new ResizeObserver(() => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      if (Math.abs(width - size.width) > 2 || Math.abs(height - size.height) > 2) {
        updatePopover(id, { size: { width, height } });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, minimised, size, updatePopover]);

  const close = useCallback(() => {
    if (kind === 'thread') abortTurn(id);
    closePopover(id);
    const returnTo = popover.returnFocus;
    if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus({ preventScroll: true });
  }, [closePopover, id, kind, popover.returnFocus]);

  const startDrag = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      const x = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 80);
      const y = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40);
      updatePopover(id, { pinned: true, position: { x, y } });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  const minimise = () => {
    const rect = ref.current?.getBoundingClientRect();
    updatePopover(id, { minimised: true, badgePosition: rect ? { x: rect.left, y: rect.top } : undefined });
  };

  const togglePin = () => {
    const el = ref.current;
    if (pinned) {
      updatePopover(id, { pinned: false, position: null });
    } else if (el) {
      const rect = el.getBoundingClientRect();
      updatePopover(id, { pinned: true, position: { x: rect.left, y: rect.top } });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Trap focus inside the popover while it is active.
    const focusables = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, a[href], [tabindex]:not([tabindex="-1"])') ?? [],
    );
    if (focusables.length === 0) return;
    const root = ref.current?.getRootNode() as ShadowRoot | Document;
    const active = root.activeElement;
    const first = focusables[0]!;
    const last = focusables.at(-1)!;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const thread = state?.thread;
  const depth = thread?.depth ?? 1;

  if (minimised) {
    const { x, y } = popover.badgePosition ?? position ?? popover.initialRect;
    return (
      <button
        type="button"
        style={{ zIndex: 2147483000 + z, transform: `translate(${x}px, ${y}px)` }}
        className="pointer-events-auto fixed top-0 left-0 flex max-w-56 items-center gap-1.5 rounded-full border border-rh-border bg-rh-bg px-3 py-1.5 text-xs text-rh-text shadow-lg hover:border-rh-accent"
        onClick={() => {
          updatePopover(id, { minimised: false });
          focusPopover(id);
        }}
        aria-label={`Restore dive: ${thread?.title ?? 'Rabbit Hole'}`}
      >
        <DiveIcon width={12} height={12} className="shrink-0 text-rh-accent" />
        <span className="truncate">{thread?.title ?? 'Rabbit Hole'}</span>
        {state?.streaming && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rh-accent motion-safe:animate-pulse" />}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={thread ? `Dive: ${thread.title}` : 'Rabbit Hole'}
      style={{ zIndex: 2147483000 + z, width: size.width, height: size.height }}
      className="pointer-events-auto fixed top-0 left-0 flex max-w-[calc(100vw-16px)] min-w-72 resize flex-col overflow-hidden rounded-xl border border-rh-border bg-rh-bg text-rh-text shadow-2xl"
      onPointerDownCapture={() => focusPopover(id)}
      onKeyDown={onKeyDown}
    >
      <header
        className="flex cursor-grab items-center gap-2 border-b border-rh-border bg-rh-surface px-3 py-2 select-none active:cursor-grabbing"
        onPointerDown={startDrag}
      >
        <DiveIcon width={14} height={14} className="shrink-0 text-rh-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{thread?.title ?? 'Rabbit Hole'}</div>
          {thread && (
            <div className="flex items-center gap-2 text-[11px] text-rh-muted">
              <span>{fragmentLabel(thread.fragmentType)}</span>
              {depth > 1 && (
                <span title={`Nested dive, level ${depth} of ${MAX_THREAD_DEPTH}`} aria-label={`Depth ${depth} of ${MAX_THREAD_DEPTH}`}>
                  {'●'.repeat(depth)}
                  {'○'.repeat(MAX_THREAD_DEPTH - depth)}
                </span>
              )}
              {thread.status === 'orphaned' && <span title="The fragment could not be found on the page">orphaned</span>}
              <span title="Tokens used by this thread (input / output)">
                {formatTokens(thread.usage.inputTokens)} in · {formatTokens(thread.usage.outputTokens)} out
              </span>
            </div>
          )}
        </div>
        {thread && (
          <HeaderButton
            label="Delete thread"
            onClick={() => {
              abortTurn(id);
              void request({ type: 'deleteThread', id }).then(() => onDeleted(id));
            }}
          >
            <TrashIcon width={14} height={14} />
          </HeaderButton>
        )}
        <HeaderButton label={pinned ? 'Unpin (follow the fragment)' : 'Pin in place'} pressed={pinned} onClick={togglePin}>
          <PinIcon width={14} height={14} />
        </HeaderButton>
        <HeaderButton label="Minimise" onClick={minimise}>
          <MinimiseIcon width={14} height={14} />
        </HeaderButton>
        <HeaderButton label="Close" onClick={close}>
          <CloseIcon width={14} height={14} />
        </HeaderButton>
      </header>

      {kind === 'onboarding' ? (
        <Onboarding />
      ) : (
        <>
          <ThreadView threadId={id} state={state} />
          <Composer
            inputRef={inputRef}
            streaming={state?.streaming ?? false}
            disabled={!thread}
            onSend={(text) => sendTurn(id, text)}
            onStop={() => abortTurn(id)}
          />
        </>
      )}
    </div>
  );
}
