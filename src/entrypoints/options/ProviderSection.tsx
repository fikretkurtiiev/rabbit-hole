import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { request } from '@/messaging/client';
import { PROVIDER_ORIGINS } from '@/providers/origins';
import { DEFAULT_MODELS } from '@/settings/defaults';
import { getKeyStatus, removeApiKey, setApiKey } from '@/settings/keys';
import { PROVIDER_IDS, type ProviderId, type Settings } from '@/settings/schema';
import { Section } from './Section';

const PROVIDER_NAMES: Record<ProviderId, string> = { anthropic: 'Anthropic', openai: 'OpenAI' };
const KEY_PLACEHOLDERS: Record<ProviderId, string> = { anthropic: 'sk-ant-…', openai: 'sk-…' };

const TEST_MESSAGES: Record<string, string> = {
  valid: 'Key works.',
  invalid: 'The provider rejected this key.',
  network: 'Could not reach the provider. Check your connection.',
  rate_limited: 'Rate limited by the provider. Try again shortly.',
  error: 'Unexpected error while testing the key.',
  no_key: 'No key saved, or the permission to reach the provider was not granted.',
};

interface ProviderSectionProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export function ProviderSection({ settings, update }: ProviderSectionProps) {
  const provider = settings.provider;
  const [keyStatus, setKeyStatus] = useState<Record<ProviderId, boolean>>({ anthropic: false, openai: false });
  const [draft, setDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [models, setModels] = useState<{ id: string; displayName: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getKeyStatus().then(setKeyStatus);
  }, []);

  const refreshModels = async () => {
    const list = await request({ type: 'listModels', provider }).catch(() => []);
    setModels(list);
  };

  const test = async () => {
    setBusy(true);
    const result = await request({ type: 'testKey', provider }).catch(() => 'error' as const);
    setMessage({ text: TEST_MESSAGES[result] ?? TEST_MESSAGES.error!, ok: result === 'valid' });
    if (result === 'valid') await refreshModels();
    setBusy(false);
  };

  const save = async () => {
    const key = draft.trim();
    if (!key) return;
    // Must be the first await so the browser still sees the click as a user gesture.
    const granted = await browser.permissions.request({ origins: [PROVIDER_ORIGINS[provider]] });
    if (!granted) {
      setMessage({
        ok: false,
        text: `Rabbit Hole needs permission to contact ${new URL(PROVIDER_ORIGINS[provider].replace('/*', '')).host} to send your dives to ${PROVIDER_NAMES[provider]}. The key was not saved.`,
      });
      return;
    }
    await setApiKey(provider, key);
    setDraft('');
    setKeyStatus(await getKeyStatus());
    await test();
  };

  const remove = async () => {
    await removeApiKey(provider);
    setKeyStatus(await getKeyStatus());
    setModels([]);
    setMessage({ text: 'Key removed.', ok: true });
  };

  const currentModel = settings.models[provider];
  const modelOptions = models.some((m) => m.id === currentModel)
    ? models
    : [{ id: currentModel, displayName: currentModel }, ...models];

  return (
    <Section title="AI provider" description="Rabbit Hole uses your own API key. Usage is billed to your provider account.">
      <div className="flex gap-2" role="radiogroup" aria-label="Provider">
        {PROVIDER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={provider === id}
            onClick={() => update({ provider: id })}
            className={`rounded-lg border px-3 py-1.5 text-sm ${provider === id ? 'border-rh-accent bg-rh-accent-soft text-rh-accent' : 'border-rh-border'}`}
          >
            {PROVIDER_NAMES[id]}
            {keyStatus[id] && <span className="ml-1.5 text-xs text-rh-muted">key saved</span>}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium" htmlFor="api-key">
        {PROVIDER_NAMES[provider]} API key
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="api-key"
          type={showKey ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={keyStatus[provider] ? '•••••••• (saved – paste a new key to replace)' : KEY_PLACEHOLDERS[provider]}
          className="min-w-64 flex-1 rounded-lg border border-rh-border bg-rh-bg px-3 py-2 font-mono text-sm"
        />
        <button type="button" onClick={() => setShowKey((v) => !v)} className="rounded-lg border border-rh-border px-3 text-sm">
          {showKey ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          disabled={!draft.trim() || busy}
          onClick={() => void save()}
          className="rounded-lg bg-rh-accent px-3 text-sm font-medium text-white disabled:opacity-40"
        >
          Save key
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!keyStatus[provider] || busy}
          onClick={() => void test()}
          className="rounded-lg border border-rh-border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {busy ? 'Testing…' : 'Test key'}
        </button>
        <button
          type="button"
          disabled={!keyStatus[provider]}
          onClick={() => void remove()}
          className="rounded-lg border border-rh-border px-3 py-1.5 text-sm text-rh-danger disabled:opacity-40"
        >
          Remove key
        </button>
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-rh-danger'}`}>
          {message.text}
        </p>
      )}

      <label className="block text-sm font-medium" htmlFor="model">
        Model
      </label>
      <div className="flex gap-2">
        <select
          id="model"
          value={currentModel}
          onChange={(e) => update({ models: { ...settings.models, [provider]: e.target.value } })}
          className="flex-1 rounded-lg border border-rh-border bg-rh-bg px-3 py-2 text-sm"
        >
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
              {m.id === DEFAULT_MODELS[provider] ? ' (default)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!keyStatus[provider]}
          onClick={() => void refreshModels()}
          className="rounded-lg border border-rh-border px-3 text-sm disabled:opacity-40"
        >
          Load models
        </button>
      </div>
    </Section>
  );
}
