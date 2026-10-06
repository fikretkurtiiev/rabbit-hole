import { create } from 'zustand';
import type { BlockType, FragmentType } from '@/settings/schema';
import type { Thread, ThreadMessage } from '@/threads/model';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the Dive button currently targets. Elements/ranges are live DOM references. */
export type DiveTarget =
  | { kind: 'block'; blockType: BlockType; element: HTMLElement; messageEl: HTMLElement }
  | { kind: 'selection'; range: Range; messageEl: HTMLElement };

export interface PopoverState {
  /** Thread id, or a synthetic id for the onboarding popover. */
  id: string;
  kind: 'thread' | 'onboarding';
  /** Where the popover first appears; it then follows its fragment until pinned or dragged. */
  initialRect: Rect;
  position: { x: number; y: number } | null;
  size: { width: number; height: number };
  pinned: boolean;
  minimised: boolean;
  /** Where the minimised badge sits (the popover's last on-screen position). */
  badgePosition?: { x: number; y: number };
  z: number;
  /** Element focused before opening, to restore focus on close. */
  returnFocus: Element | null;
}

export interface ThreadState {
  thread: Thread | null;
  messages: ThreadMessage[];
  streamingText: string;
  streaming: boolean;
  error: { code: string; message: string } | null;
}

export interface AnchoredThread {
  id: string;
  kind: 'block' | 'text';
}

interface UiStore {
  /** Threads whose fragment is currently found on the page (geometry lives in anchorRegistry). */
  anchored: AnchoredThread[];
  theme: 'light' | 'dark';
  diveTarget: DiveTarget | null;
  popovers: PopoverState[];
  threads: Record<string, ThreadState>;
  nextZ: number;

  setAnchored(anchored: AnchoredThread[]): void;
  setTheme(theme: 'light' | 'dark'): void;
  setDiveTarget(target: DiveTarget | null): void;
  openPopover(popover: Omit<PopoverState, 'z' | 'position' | 'size' | 'pinned' | 'minimised'>): void;
  updatePopover(id: string, patch: Partial<PopoverState>): void;
  focusPopover(id: string): void;
  closePopover(id: string): void;
  setThreadState(id: string, patch: Partial<ThreadState>): void;
}

export const DEFAULT_POPOVER_SIZE = { width: 400, height: 440 };

const emptyThreadState: ThreadState = { thread: null, messages: [], streamingText: '', streaming: false, error: null };

export const useUiStore = create<UiStore>((set) => ({
  anchored: [],
  theme: 'light',
  diveTarget: null,
  popovers: [],
  threads: {},
  nextZ: 1,

  setAnchored: (anchored) => set({ anchored }),
  setTheme: (theme) => set({ theme }),
  setDiveTarget: (diveTarget) => set({ diveTarget }),

  openPopover: (popover) =>
    set((state) => {
      const existing = state.popovers.find((p) => p.id === popover.id);
      if (existing) {
        return {
          popovers: state.popovers.map((p) => (p.id === popover.id ? { ...p, minimised: false, z: state.nextZ } : p)),
          nextZ: state.nextZ + 1,
        };
      }
      return {
        popovers: [
          ...state.popovers,
          { ...popover, position: null, size: DEFAULT_POPOVER_SIZE, pinned: false, minimised: false, z: state.nextZ },
        ],
        nextZ: state.nextZ + 1,
      };
    }),

  updatePopover: (id, patch) =>
    set((state) => ({ popovers: state.popovers.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  focusPopover: (id) =>
    set((state) => {
      const top = Math.max(0, ...state.popovers.map((p) => p.z));
      if (state.popovers.find((p) => p.id === id)?.z === top) return state;
      return {
        popovers: state.popovers.map((p) => (p.id === id ? { ...p, z: state.nextZ } : p)),
        nextZ: state.nextZ + 1,
      };
    }),

  closePopover: (id) => set((state) => ({ popovers: state.popovers.filter((p) => p.id !== id) })),

  setThreadState: (id, patch) =>
    set((state) => ({
      threads: { ...state.threads, [id]: { ...emptyThreadState, ...state.threads[id], ...patch } },
    })),
}));

export function fragmentLabel(type: FragmentType): string {
  return type === 'selection' ? 'selection' : type;
}
