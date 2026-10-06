import { browser } from 'wxt/browser';
import { migrateSettings } from './migrations';
import type { Settings } from './schema';

const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return migrateSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: migrateSettings(settings) });
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = migrateSettings({ ...(await loadSettings()), ...patch });
  await saveSettings(next);
  return next;
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && SETTINGS_KEY in changes) {
      listener(migrateSettings(changes[SETTINGS_KEY]?.newValue));
    }
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
