import { useState, type KeyboardEvent, type RefObject } from 'react';
import { SendIcon, StopIcon } from './icons';

interface ComposerProps {
  streaming: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function Composer({ streaming, disabled, onSend, onStop, inputRef }: ComposerProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || streaming || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-rh-border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={disabled}
        placeholder="Ask a follow-up…"
        aria-label="Ask a follow-up question"
        className="field-sizing-content max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-rh-border bg-rh-bg px-3 py-2 text-sm text-rh-text placeholder:text-rh-muted focus:border-rh-accent focus:outline-none"
      />
      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-rh-border text-rh-text hover:border-rh-accent"
        >
          <StopIcon />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!text.trim() || disabled}
          aria-label="Send"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-rh-accent text-white disabled:opacity-40"
        >
          <SendIcon />
        </button>
      )}
    </form>
  );
}
