import { createAnthropicProvider } from './anthropic';
import { ProviderError, errorFromStatus } from './errors';
import { createOpenAIProvider } from './openai';
import type { Chunk } from './types';

function sseResponse(events: string[], init: ResponseInit = {}): Response {
  const body = events.join('');
  return new Response(
    new ReadableStream({
      start(controller) {
        // Split mid-event to exercise buffering.
        const bytes = new TextEncoder().encode(body);
        const mid = Math.floor(bytes.length / 2);
        controller.enqueue(bytes.slice(0, mid));
        controller.enqueue(bytes.slice(mid));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' }, ...init },
  );
}

async function collect(iterable: AsyncIterable<Chunk>): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

const opts = { model: 'm', system: 'sys', maxOutputTokens: 100 };

describe('errorFromStatus', () => {
  it.each([
    [401, '', 'invalid_key'],
    [400, 'Your credit balance is too low', 'quota'],
    [429, '', 'rate_limited'],
    [404, '', 'model_unavailable'],
    [500, '', 'rate_limited'],
    [400, 'bad', 'unknown'],
  ] as const)('maps %i %s to %s', (status, body, code) => {
    expect(errorFromStatus(status, body).code).toBe(code);
  });
});

describe('OpenAI provider', () => {
  it('streams text and usage', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const provider = createOpenAIProvider('sk-test', fetchMock);
    const chunks = await collect(provider.streamChat([{ role: 'user', content: 'hi' }], opts));
    expect(chunks).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'usage', usage: { inputTokens: 12, outputTokens: 3 } },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-test');
  });

  it('maps a 401 to invalid_key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 }));
    const provider = createOpenAIProvider('bad', fetchMock);
    await expect(collect(provider.streamChat([], opts))).rejects.toMatchObject({ code: 'invalid_key' });
    expect(await provider.testKey()).toBe('invalid');
  });

  it('reports network errors from testKey', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await createOpenAIProvider('k', fetchMock).testKey()).toBe('network');
  });

  it('lists only chat models', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ data: [{ id: 'gpt-5' }, { id: 'text-embedding-3-small' }, { id: 'o4-mini' }, { id: 'gpt-4o-audio' }] }),
    );
    const models = await createOpenAIProvider('k', fetchMock).listModels();
    expect(models.map((m) => m.id)).toEqual(['gpt-5', 'o4-mini']);
  });
});

describe('Anthropic provider', () => {
  function anthropicEvents(stopReason = 'end_turn'): string[] {
    const event = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    return [
      event('message_start', {
        message: {
          id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [],
          stop_reason: null, stop_sequence: null, usage: { input_tokens: 20, output_tokens: 1 },
        },
      }),
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Hi ' } }),
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'there' } }),
      event('content_block_stop', { index: 0 }),
      event('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } }),
      event('message_stop', {}),
    ];
  }

  it('streams text and usage with the browser-access header', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => sseResponse(anthropicEvents()));
    const provider = createAnthropicProvider('sk-ant', fetchMock);
    const chunks = await collect(provider.streamChat([{ role: 'user', content: 'hi' }], opts));
    expect(chunks.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.text : ''))).toEqual(['Hi ', 'there']);
    expect(chunks.at(-1)).toEqual({ type: 'usage', usage: { inputTokens: 20, outputTokens: 5 } });
    const init = fetchMock.mock.calls[0]![1];
    const headers = new Headers(init?.headers);
    expect(headers.get('x-api-key')).toBe('sk-ant');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
  });

  it('turns a refusal into a ProviderError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => sseResponse(anthropicEvents('refusal')));
    const provider = createAnthropicProvider('sk-ant', fetchMock);
    await expect(collect(provider.streamChat([{ role: 'user', content: 'x' }], opts))).rejects.toMatchObject({ code: 'refused' });
  });

  it('maps an auth failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, { status: 401 }),
    );
    const provider = createAnthropicProvider('bad', fetchMock);
    expect(await provider.testKey()).toBe('invalid');
    const error = await collect(provider.streamChat([{ role: 'user', content: 'x' }], opts)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe('invalid_key');
  });
});
