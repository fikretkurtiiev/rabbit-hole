import { DEFAULT_SETTINGS } from './defaults';
import { migrateSettings } from './migrations';

describe('migrateSettings', () => {
  it('returns defaults for empty or garbage input', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and fills missing nested fields', () => {
    const result = migrateSettings({ provider: 'openai', hoverButtons: { paragraph: false } });
    expect(result.provider).toBe('openai');
    expect(result.hoverButtons.paragraph).toBe(false);
    expect(result.hoverButtons.code).toBe(true);
  });

  it('replaces only invalid fields with defaults', () => {
    const result = migrateSettings({ provider: 'mystery', maxOutputTokens: 2048 });
    expect(result.provider).toBe(DEFAULT_SETTINGS.provider);
    expect(result.maxOutputTokens).toBe(2048);
  });

  it('upgrades a missing version to the current one', () => {
    expect(migrateSettings({ introLength: 'medium' }).version).toBe(DEFAULT_SETTINGS.version);
  });
});
