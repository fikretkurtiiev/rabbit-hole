/** Parses a `text/event-stream` body into the `data:` payload of each event. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
        const data = dataOf(rawEvent);
        if (data !== null) yield data;
      }
    }
    buffer += decoder.decode();
    const data = dataOf(buffer);
    if (data !== null) yield data;
  } finally {
    reader.releaseLock();
  }
}

function dataOf(rawEvent: string): string | null {
  const lines = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return lines.length > 0 ? lines.join('\n') : null;
}
