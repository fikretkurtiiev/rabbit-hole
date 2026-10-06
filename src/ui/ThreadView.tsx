import { useEffect, useRef } from 'react';
import { Markdown } from './Markdown';
import type { ThreadState } from './store';
import { sendTurn } from './threadActions';

interface ThreadViewProps {
  threadId: string;
  state: ThreadState | undefined;
}

export function ThreadView({ threadId, state }: ThreadViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const messages = state?.messages ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, state?.streamingText]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      aria-live="polite"
    >
      {messages.map((message) =>
        message.role === 'user' ? (
          <div key={message.id} className="ml-8 rounded-lg bg-rh-surface px-3 py-2 whitespace-pre-wrap">
            {message.content}
          </div>
        ) : (
          // Nested dives: the content script detects blocks/selection inside these elements.
          <div key={message.id} data-rh-message-id={message.id} data-rh-thread-id={threadId} data-rh-role="assistant">
            <Markdown content={message.content} />
          </div>
        ),
      )}

      {state?.streaming &&
        (state.streamingText ? (
          <div data-rh-streaming="true">
            <Markdown content={state.streamingText} />
          </div>
        ) : (
          <div className="flex gap-1 py-2" aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-rh-muted motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        ))}

      {state?.error && (
        <div role="alert" className="rounded-lg border border-rh-danger/40 px-3 py-2 text-rh-danger">
          <p>{state.error.message}</p>
          {state.error.code !== 'no_key' && state.error.code !== 'invalid_key' && (
            <button type="button" className="mt-1 text-xs underline" onClick={() => sendTurn(threadId)}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
