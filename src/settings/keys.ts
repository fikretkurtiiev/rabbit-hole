import { browser } from 'wxt/browser';
import { ApiKeysSchema, type ApiKeys, type ProviderId } from './schema';

// API keys. Only the background and the options page may import this module (enforced by ESLint).
// Keys live in storage.local only: never storage.sync, never IndexedDB, never logged.

const KEYS_KEY = 'apiKeys';

async function loadKeys(): Promise<ApiKeys> {
  const stored = await browser.storage.local.get(KEYS_KEY);
  const parsed = ApiKeysSchema.safeParse(stored[KEYS_KEY] ?? {});
  return parsed.success ? parsed.data : {};
}

export async function getApiKey(provider: ProviderId): Promise<string | undefined> {
  return (await loadKeys())[provider];
}

export async function setApiKey(provider: ProviderId, key: string): Promise<void> {
  const keys = await loadKeys();
  await browser.storage.local.set({ [KEYS_KEY]: { ...keys, [provider]: key.trim() } });
}

export async function removeApiKey(provider: ProviderId): Promise<void> {
  const { [provider]: _removed, ...rest } = await loadKeys();
  await browser.storage.local.set({ [KEYS_KEY]: rest });
}

export async function getKeyStatus(): Promise<Record<ProviderId, boolean>> {
  const keys = await loadKeys();
  return { anthropic: Boolean(keys.anthropic), openai: Boolean(keys.openai) };
}

export async function clearAllStorage(): Promise<void> {
  await browser.storage.local.clear();
}
