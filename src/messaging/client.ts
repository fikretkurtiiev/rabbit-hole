import { browser } from 'wxt/browser';
import {
  EnvelopeSchema,
  PortServerMessageSchema,
  ResponseSchemas,
  STREAM_PORT_NAME,
  type PortClientMessage,
  type PortServerMessage,
  type Request,
  type ResponseFor,
} from './contracts';

/** Sends a typed request to the background and validates the response. */
export async function request<T extends Request>(message: T): Promise<ResponseFor<T['type']>> {
  const raw: unknown = await browser.runtime.sendMessage(message);
  const envelope = EnvelopeSchema.parse(raw);
  if (!envelope.ok) throw new Error(envelope.error);
  return ResponseSchemas[message.type].parse(envelope.data) as ResponseFor<T['type']>;
}

export interface StreamHandle {
  abort(): void;
}

/** Opens a port for one streamed turn of a thread. The port closes itself on done/error. */
export function streamTurn(
  start: Extract<PortClientMessage, { type: 'start' }>,
  onMessage: (message: PortServerMessage) => void,
): StreamHandle {
  const port = browser.runtime.connect({ name: STREAM_PORT_NAME });
  let finished = false;

  port.onMessage.addListener((raw: unknown) => {
    const parsed = PortServerMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    onMessage(parsed.data);
    if (parsed.data.type === 'done' || parsed.data.type === 'error') {
      finished = true;
      port.disconnect();
    }
  });
  port.onDisconnect.addListener(() => {
    if (!finished) {
      finished = true;
      // Background was suspended or reloaded mid-stream.
      onMessage({ type: 'error', code: 'network', message: 'The connection to the extension was lost. Try again.' });
    }
  });
  port.postMessage(start);

  return {
    abort() {
      if (finished) return;
      port.postMessage({ type: 'abort' } satisfies PortClientMessage);
    },
  };
}
