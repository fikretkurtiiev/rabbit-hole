import Anthropic from '@anthropic-ai/sdk';
import { ProviderError, USER_MESSAGES, errorFromStatus, keyTestResultFromError } from './errors';
import type { ChatMessage, ChatProvider, Chunk, KeyTestResult, ModelInfo, StreamOptions } from './types';

/** Models that accept the server-side `fallbacks: "default"` parameter on refusals. */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function mapAnthropicError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new ProviderError('aborted', USER_MESSAGES.aborted);
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError('network', USER_MESSAGES.network);
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    return errorFromStatus(error.status, error.message, error.headers?.get('retry-after'));
  }
  if (error instanceof Error && error.name === 'AbortError') return new ProviderError('aborted', USER_MESSAGES.aborted);
  return new ProviderError('unknown', USER_MESSAGES.unknown);
}

export function createAnthropicProvider(apiKey: string, fetchImpl?: typeof fetch): ChatProvider {
  const client = new Anthropic({
    apiKey,
    // Runs in the extension background; the key never leaves the user's browser except to Anthropic.
    dangerouslyAllowBrowser: true,
    fetch: fetchImpl,
  });

  async function* streamChat(messages: ChatMessage[], opts: StreamOptions): AsyncIterable<Chunk> {
    const useFallbacks = FALLBACK_MODELS.has(opts.model);
    try {
      const stream = client.beta.messages.stream(
        {
          model: opts.model,
          max_tokens: opts.maxOutputTokens,
          system: opts.system,
          messages,
          ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        },
        { signal: opts.signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield {
        type: 'usage',
        usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
      };
      if (final.stop_reason === 'refusal') throw new ProviderError('refused', USER_MESSAGES.refused);
    } catch (error) {
      throw mapAnthropicError(error);
    }
  }

  async function listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const models: ModelInfo[] = [];
      for await (const model of client.models.list({ limit: 100 }, { signal })) {
        models.push({ id: model.id, displayName: model.display_name });
      }
      return models;
    } catch (error) {
      throw mapAnthropicError(error);
    }
  }

  async function testKey(signal?: AbortSignal): Promise<KeyTestResult> {
    try {
      await client.models.list({ limit: 1 }, { signal, maxRetries: 0 });
      return 'valid';
    } catch (error) {
      return keyTestResultFromError(mapAnthropicError(error));
    }
  }

  return { id: 'anthropic', streamChat, listModels, testKey };
}
