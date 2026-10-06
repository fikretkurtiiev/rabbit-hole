import { SETTINGS_VERSION, type ProviderId, type Settings } from './schema';

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5-mini',
};

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  provider: 'anthropic',
  models: { ...DEFAULT_MODELS },
  introLength: 'short',
  maxOutputTokens: 1024,
  contextBudgetTokens: 6000,
  hoverButtons: {
    code: true,
    table: true,
    math: true,
    paragraph: true,
    list: true,
    blockquote: true,
  },
  sites: { chatgpt: true, claude: true },
  appearance: 'host',
};
