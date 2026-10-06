import { request, streamTurn, type StreamHandle } from '@/messaging/client';
import { useUiStore } from './store';

const activeStreams = new Map<string, StreamHandle>();

export async function loadThread(threadId: string): Promise<void> {
  const { setThreadState } = useUiStore.getState();
  try {
    const data = await request({ type: 'getThread', id: threadId });
    if (!data) {
      setThreadState(threadId, { error: { code: 'unknown', message: 'This thread no longer exists.' } });
      return;
    }
    setThreadState(threadId, { thread: data.thread, messages: data.messages });
    // A fresh thread (or one whose last turn failed) still needs an answer.
    const last = data.messages.at(-1);
    if (!activeStreams.has(threadId) && (!last || last.role === 'user')) sendTurn(threadId);
  } catch (error) {
    setThreadState(threadId, { error: { code: 'unknown', message: error instanceof Error ? error.message : String(error) } });
  }
}

/** Streams one assistant turn. Without `userText` it generates the intro or retries the last question. */
export function sendTurn(threadId: string, userText?: string): void {
  if (activeStreams.has(threadId)) return;
  const store = useUiStore.getState();
  store.setThreadState(threadId, { streaming: true, streamingText: '', error: null });

  const handle = streamTurn({ type: 'start', threadId, userText }, (event) => {
    const { threads, setThreadState } = useUiStore.getState();
    const current = threads[threadId];
    switch (event.type) {
      case 'userMessage':
        setThreadState(threadId, { messages: [...(current?.messages ?? []), event.message] });
        break;
      case 'delta':
        setThreadState(threadId, { streamingText: (current?.streamingText ?? '') + event.text });
        break;
      case 'done': {
        activeStreams.delete(threadId);
        const thread = current?.thread;
        setThreadState(threadId, {
          messages: [...(current?.messages ?? []), event.message],
          streamingText: '',
          streaming: false,
          thread: thread && {
            ...thread,
            usage: {
              inputTokens: thread.usage.inputTokens + event.usage.inputTokens,
              outputTokens: thread.usage.outputTokens + event.usage.outputTokens,
            },
          },
        });
        break;
      }
      case 'error':
        activeStreams.delete(threadId);
        setThreadState(threadId, { streaming: false, streamingText: '', error: { code: event.code, message: event.message } });
        break;
    }
  });
  activeStreams.set(threadId, handle);
}

export function abortTurn(threadId: string): void {
  activeStreams.get(threadId)?.abort();
}

export function isStreaming(threadId: string): boolean {
  return activeStreams.has(threadId);
}
