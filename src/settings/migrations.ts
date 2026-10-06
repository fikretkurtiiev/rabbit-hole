import { DEFAULT_SETTINGS } from './defaults';
import { SettingsSchema, type Settings } from './schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turns whatever is in storage into a valid, current Settings object.
 * Unknown or invalid fields fall back to defaults so a bad value never crashes the extension.
 */
export function migrateSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return structuredClone(DEFAULT_SETTINGS);

  // Future versions: transform `raw` step by step based on raw.version here.
  const merged: Record<string, unknown> = { ...structuredClone(DEFAULT_SETTINGS) };
  for (const [key, value] of Object.entries(raw)) {
    const defaultValue = merged[key];
    merged[key] = isRecord(defaultValue) && isRecord(value) ? { ...defaultValue, ...value } : value;
  }
  merged.version = DEFAULT_SETTINGS.version;

  const parsed = SettingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;

  // Drop only the invalid top-level fields.
  const repaired: Record<string, unknown> = { ...merged };
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string') {
      repaired[field] = structuredClone((DEFAULT_SETTINGS as Record<string, unknown>)[field]);
    }
  }
  const retry = SettingsSchema.safeParse(repaired);
  return retry.success ? retry.data : structuredClone(DEFAULT_SETTINGS);
}
