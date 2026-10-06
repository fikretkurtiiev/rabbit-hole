import { useEffect, useState } from 'react';
import { blockLabel } from '@/blocks/detect';
import { BLOCK_TYPES, SITE_IDS, type Settings, type SiteId } from '@/settings/schema';
import { loadSettings, onSettingsChanged, updateSettings } from '@/settings/storage';
import { usePageTheme } from '@/ui/usePageTheme';
import { DataSection } from './DataSection';
import { NumberField } from './NumberField';
import { ProviderSection } from './ProviderSection';
import { Section } from './Section';
import { Toggle } from './Toggle';

const SITE_NAMES: Record<SiteId, string> = { chatgpt: 'ChatGPT', claude: 'Claude' };

export function OptionsApp() {
  const theme = usePageTheme();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
    return onSettingsChanged(setSettings);
  }, []);

  if (!settings) return null;
  const update = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch });
    void updateSettings(patch);
  };

  return (
    <div className="rh-root min-h-screen bg-rh-bg" data-theme={theme}>
      <main className="mx-auto max-w-2xl space-y-5 px-5 py-8">
        <header>
          <h1 className="text-2xl font-semibold">Rabbit Hole</h1>
          <p className="text-rh-muted">
            Dive into any part of an AI answer in a side thread, without touching the main conversation.
          </p>
        </header>

        <p className="rounded-lg border border-rh-accent/40 bg-rh-accent-soft px-4 py-3 text-sm">
          Rabbit Hole has no backend and no shared key. Every dive is sent directly from your browser to the provider
          you choose, and <strong>usage is billed to your own provider account</strong>.
        </p>

        {/* Keyed by provider so switching resets the key draft, messages and model list. */}
        <ProviderSection key={settings.provider} settings={settings} update={update} />

        <Section title="Answers">
          <label className="flex items-center justify-between gap-4 text-sm">
            Intro length
            <select
              value={settings.introLength}
              onChange={(e) => update({ introLength: e.target.value === 'medium' ? 'medium' : 'short' })}
              className="rounded-lg border border-rh-border bg-rh-bg px-2 py-1"
            >
              <option value="short">Short (3–4 sentences)</option>
              <option value="medium">Medium (5–6 sentences)</option>
            </select>
          </label>
          <NumberField
            label="Max output tokens"
            value={settings.maxOutputTokens}
            min={64}
            max={32000}
            onChange={(maxOutputTokens) => update({ maxOutputTokens })}
          />
          <NumberField
            label="Context budget (tokens of the surrounding answer and question)"
            value={settings.contextBudgetTokens}
            min={500}
            max={100000}
            onChange={(contextBudgetTokens) => update({ contextBudgetTokens })}
          />
        </Section>

        <Section title="Hover buttons" description="Which blocks show a “Dive in” button on hover. Text selection always works.">
          {BLOCK_TYPES.map((type) => (
            <Toggle
              key={type}
              label={blockLabel(type).replace(/^./, (c) => c.toUpperCase())}
              checked={settings.hoverButtons[type]}
              onChange={(checked) => update({ hoverButtons: { ...settings.hoverButtons, [type]: checked } })}
            />
          ))}
        </Section>

        <Section title="Sites">
          {SITE_IDS.map((id) => (
            <Toggle
              key={id}
              label={SITE_NAMES[id]}
              checked={settings.sites[id]}
              onChange={(checked) => update({ sites: { ...settings.sites, [id]: checked } })}
            />
          ))}
        </Section>

        <Section title="Appearance">
          <div className="flex gap-2" role="radiogroup" aria-label="Theme">
            {(['host', 'light', 'dark'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={settings.appearance === value}
                onClick={() => update({ appearance: value })}
                className={`rounded-lg border px-3 py-1.5 text-sm ${settings.appearance === value ? 'border-rh-accent bg-rh-accent-soft text-rh-accent' : 'border-rh-border'}`}
              >
                {value === 'host' ? 'Follow site' : value === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </Section>

        <DataSection />
      </main>
    </div>
  );
}
