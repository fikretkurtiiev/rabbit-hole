import type { ProviderId } from '@/settings/schema';

/** Optional host permissions requested when the user saves a key for a provider. */
export const PROVIDER_ORIGINS: Record<ProviderId, string> = {
  anthropic: 'https://api.anthropic.com/*',
  openai: 'https://api.openai.com/*',
};
