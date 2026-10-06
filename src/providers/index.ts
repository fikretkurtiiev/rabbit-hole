import type { ProviderId } from '@/settings/schema';
import { createAnthropicProvider } from './anthropic';
import { createOpenAIProvider } from './openai';
import type { ChatProvider } from './types';

export function createProvider(id: ProviderId, apiKey: string): ChatProvider {
  switch (id) {
    case 'anthropic':
      return createAnthropicProvider(apiKey);
    case 'openai':
      return createOpenAIProvider(apiKey);
  }
}

export { PROVIDER_ORIGINS } from './origins';
