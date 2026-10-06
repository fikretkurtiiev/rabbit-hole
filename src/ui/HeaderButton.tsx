import type { ReactNode } from 'react';

interface HeaderButtonProps {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function HeaderButton({ label, pressed, onClick, children }: HeaderButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-rh-border/60 focus-visible:outline-2 focus-visible:outline-rh-accent ${pressed ? 'text-rh-accent' : 'text-rh-muted'}`}
    >
      {children}
    </button>
  );
}
