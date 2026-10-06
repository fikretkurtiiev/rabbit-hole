import { z } from 'zod';
import { ProviderError, USER_MESSAGES, errorFromStatus, keyTestResultFromError, withBackoff } from './errors';
import { parseSse } from './sse';
import type { ChatMessage, ChatProvider, Chunk, KeyTestResult, ModelInfo, StreamOptions } from './types';

const BASE_URL = 'https://api.openai.com/v1';

const StreamChunkSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }).partial() })).optional(),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
});

const ModelListSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

/** Ids that are chat-capable text models (not embeddings, audio, image, moderation...). */
function isChatModel(id: string): boolean {
  return /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|image|transcribe|tts|search|embedding)/.test(id);
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Error && error.name === 'AbortError') return new ProviderError('aborted', USER_MESSAGES.aborted);
  if (error instanceof TypeError) return new ProviderError('network', USER_MESSAGES.network);
  return new ProviderError('unknown', USER_MESSAGES.unknown);
}

export function createOpenAIProvider(apiKey: string, fetchImpl: typeof fetch = fetch): ChatProvider {
  async function request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${BASE_URL}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...init.headers },
      });
    } catch (error) {
      throw toProviderError(error);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw errorFromStatus(response.status, body, response.headers.get('retry-after'));
    }
    return response;
  }

  async function* streamChat(messages: ChatMessage[], opts: StreamOptions): AsyncIterable<Chunk> {
    try {
      const response = await withBackoff(
        () =>
          request('/chat/completions', {
            method: 'POST',
            signal: opts.signal,
            body: JSON.stringify({
              model: opts.model,
              stream: true,
              stream_options: { include_usage: true },
              max_completion_tokens: opts.maxOutputTokens,
              messages: [{ role: 'system', content: opts.system }, ...messages],
            }),
          }),
        opts.signal,
      );
      if (!response.body) throw new ProviderError('unknown', USER_MESSAGES.unknown);
      for await (const data of parseSse(response.body)) {
        if (data === '[DONE]') break;
        const parsed = StreamChunkSchema.safeParse(JSON.parse(data));
        if (!parsed.success) continue;
        const text = parsed.data.choices?.[0]?.delta.content;
        if (text) yield { type: 'text', text };
        if (parsed.data.usage) {
          yield {
            type: 'usage',
            usage: {
              inputTokens: parsed.data.usage.prompt_tokens,
              outputTokens: parsed.data.usage.completion_tokens,
            },
          };
        }
      }
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async function listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await request('/models', { method: 'GET', signal });
    const parsed = ModelListSchema.parse(await response.json());
    return parsed.data
      .map((model) => model.id)
      .filter(isChatModel)
      .sort()
      .map((id) => ({ id, displayName: id }));
  }

  async function testKey(signal?: AbortSignal): Promise<KeyTestResult> {
    try {
      await request('/models', { method: 'GET', signal });
      return 'valid';
    } catch (error) {
      return keyTestResultFromError(error);
    }
  }

  return { id: 'openai', streamChat, listModels, testKey };
}
