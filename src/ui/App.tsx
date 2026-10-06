import type { ButtonOffset } from '@/adapters/types';
import type { BlockType } from '@/settings/schema';
import { DiveButton } from './DiveButton';
import { Overlay } from './Overlay';
import { Popover } from './Popover';
import { useUiStore, type DiveTarget } from './store';

export interface AppProps {
  nativeHighlights: boolean;
  getButtonOffset: (type: BlockType) => ButtonOffset;
  onDive: (target: DiveTarget) => void;
  onButtonPointerEnter: () => void;
  onButtonPointerLeave: () => void;
  onThreadDeleted: (threadId: string) => void;
}

export function App(props: AppProps) {
  const theme = useUiStore((s) => s.theme);
  const popovers = useUiStore((s) => s.popovers);

  return (
    <div className="rh-root" data-theme={theme}>
      <Overlay nativeHighlights={props.nativeHighlights} />
      {popovers.map((popover) => (
        <Popover key={popover.id} popover={popover} onDeleted={props.onThreadDeleted} />
      ))}
      <DiveButton
        getOffset={props.getButtonOffset}
        onDive={props.onDive}
        onPointerEnter={props.onButtonPointerEnter}
        onPointerLeave={props.onButtonPointerLeave}
      />
    </div>
  );
}
