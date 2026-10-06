import { z } from 'zod';
import type { KeyTestResult } from './types';

export const ProviderErrorCodeSchema = z.enum([
  'no_key',
  'invalid_key',
  'quota',
  'rate_limited',
  'model_unavailable',
  'network',
  'aborted',
  'refused',
  'unknown',
]);
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>;

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const USER_MESSAGES: Record<ProviderErrorCode, string> = {
  no_key: 'Add an API key in Settings to start diving.',
  invalid_key: 'Your API key was rejected. Check it in Settings.',
  quota: 'Your provider account is out of credits or quota.',
  rate_limited: 'The provider is rate limiting requests. Try again in a moment.',
  model_unavailable: 'The selected model is not available for this key. Pick another in Settings.',
  network: 'Could not reach the provider. Check your connection.',
  aborted: 'Stopped.',
  refused: 'The model declined to answer this request.',
  unknown: 'Something went wrong talking to the provider.',
};

export function errorFromStatus(status: number, body: string, retryAfter?: string | null): ProviderError {
  const lower = body.toLowerCase();
  const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 || undefined : undefined;
  if (status === 401 || status === 403) return new ProviderError('invalid_key', USER_MESSAGES.invalid_key);
  if (status === 402 || lower.includes('credit balance') || lower.includes('insufficient_quota')) {
    return new ProviderError('quota', USER_MESSAGES.quota);
  }
  if (status === 429) return new ProviderError('rate_limited', USER_MESSAGES.rate_limited, retryAfterMs);
  if (status === 404 || lower.includes('model_not_found') || lower.includes('does not exist')) {
    return new ProviderError('model_unavailable', USER_MESSAGES.model_unavailable);
  }
  if (status === 529 || status >= 500) return new ProviderError('rate_limited', 'The provider is overloaded. Try again shortly.', retryAfterMs);
  return new ProviderError('unknown', USER_MESSAGES.unknown);
}

export function keyTestResultFromError(error: unknown): KeyTestResult {
  if (!(error instanceof ProviderError)) return 'error';
  switch (error.code) {
    case 'invalid_key':
      return 'invalid';
    case 'network':
      return 'network';
    case 'rate_limited':
      return 'rate_limited';
    // A key that is valid but out of credits still authenticates.
    case 'quota':
      return 'valid';
    default:
      return 'error';
  }
}

/** Retries `fn` on rate limits with exponential backoff, honouring Retry-After. */
export async function withBackoff<T>(fn: () => Promise<T>, signal?: AbortSignal, attempts = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof ProviderError && error.code === 'rate_limited';
      if (!retryable || attempt >= attempts - 1 || signal?.aborted) throw error;
      const delay = error.retryAfterMs ?? 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 20_000)));
    }
  }
}
