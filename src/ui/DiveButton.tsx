import { autoUpdate, computePosition, flip, offset, shift, type VirtualElement } from '@floating-ui/dom';
import { useLayoutEffect, useRef } from 'react';
import { blockLabel } from '@/blocks/detect';
import type { ButtonOffset } from '@/adapters/types';
import type { BlockType } from '@/settings/schema';
import { DiveIcon } from './icons';
import { useUiStore, type DiveTarget } from './store';

const INSET = 6;

interface DiveButtonProps {
  getOffset: (type: BlockType) => ButtonOffset;
  onDive: (target: DiveTarget) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

function referenceFor(target: DiveTarget): Element | VirtualElement {
  if (target.kind === 'block') return target.element;
  const { range } = target;
  return {
    // Anchor to the end of the selection (last line box).
    getBoundingClientRect: () => {
      const rects = range.getClientRects();
      return rects.length > 0 ? rects[rects.length - 1]! : range.getBoundingClientRect();
    },
    contextElement: target.messageEl,
  };
}

export function DiveButton({ getOffset, onDive, onPointerEnter, onPointerLeave }: DiveButtonProps) {
  const target = useUiStore((s) => s.diveTarget);
  const ref = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const button = ref.current;
    if (!button || !target) return;
    const reference = referenceFor(target);
    const update = () => {
      const middleware =
        target.kind === 'block'
          ? (() => {
              const extra = getOffset(target.blockType);
              // Sit inside the block's top-right corner, clear of host controls.
              return [
                offset({ mainAxis: -(button.offsetWidth + INSET + extra.x), crossAxis: INSET + extra.y }),
                shift({ padding: 4 }),
              ];
            })()
          : [offset(6), flip(), shift({ padding: 4 })];
      void computePosition(reference, button, {
        strategy: 'fixed',
        placement: target.kind === 'block' ? 'right-start' : 'bottom-end',
        middleware,
      }).then(({ x, y }) => {
        button.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      });
    };
    return autoUpdate(reference, button, update);
  }, [target, getOffset]);

  if (!target) return null;
  const label = target.kind === 'block' ? `Dive into this ${blockLabel(target.blockType)}` : 'Dive into the selected text';

  return (
    <button
      ref={ref}
      type="button"
      data-rh-dive=""
      aria-label={label}
      title={label}
      className="pointer-events-auto fixed top-0 left-0 z-[2147483646] flex items-center gap-1 rounded-full border border-rh-border bg-rh-bg px-2 py-1 text-xs font-medium text-rh-text shadow-md hover:border-rh-accent hover:text-rh-accent focus-visible:outline-2 focus-visible:outline-rh-accent motion-safe:transition-colors"
      // Keep the host selection alive when clicking.
      onMouseDown={(e) => e.preventDefault()}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={() => onDive(target)}
    >
      <DiveIcon width={14} height={14} />
      Dive in
    </button>
  );
}
