import { useEffect, useState } from 'react';
import { anchorRegistry } from './anchorRegistry';
import { useUiStore } from './store';

interface OverlayProps {
  /** True when the CSS Custom Highlight API handles text fragments, so only blocks need drawing. */
  nativeHighlights: boolean;
}

/**
 * Draws block outlines (and text highlights when CSS.highlights is unavailable) from the Shadow DOM
 * layer, so the host's DOM and styles are never modified.
 */
export function Overlay({ nativeHighlights }: OverlayProps) {
  const anchored = useUiStore((s) => s.anchored);
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (anchored.length === 0) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFrame((f) => f + 1));
    };
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    const interval = window.setInterval(schedule, 1000); // Catch host layout shifts without observers.
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      window.clearInterval(interval);
    };
  }, [anchored.length]);

  const boxes: { key: string; rect: DOMRect; kind: 'block' | 'text' }[] = [];
  for (const { id, kind } of anchored) {
    const geometry = anchorRegistry.get(id);
    if (!geometry) continue;
    if (kind === 'block') {
      const rect = geometry.getRect();
      if (rect && rect.width > 0) boxes.push({ key: id, rect, kind });
    } else if (!nativeHighlights) {
      geometry.getClientRects?.().forEach((rect, i) => boxes.push({ key: `${id}-${i}`, rect, kind }));
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[2147482000] overflow-hidden" aria-hidden="true">
      {boxes.map(({ key, rect, kind }) => (
        <div
          key={key}
          className={
            kind === 'block'
              ? 'absolute rounded-md outline-2 outline-offset-2 outline-rh-accent/45 outline-dashed'
              : 'absolute rounded-sm bg-orange-400/25'
          }
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      ))}
    </div>
  );
}
