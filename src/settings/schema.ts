import { z } from 'zod';

// Never probe or use `new Function` (blocked by extension CSP and flagged by AMO review).
z.config({ jitless: true });

export const PROVIDER_IDS = ['anthropic', 'openai'] as const;
export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const BLOCK_TYPES = ['code', 'table', 'math', 'paragraph', 'list', 'blockquote'] as const;
export const BlockTypeSchema = z.enum(BLOCK_TYPES);
export type BlockType = z.infer<typeof BlockTypeSchema>;

export const FragmentTypeSchema = z.enum([...BLOCK_TYPES, 'selection']);
export type FragmentType = z.infer<typeof FragmentTypeSchema>;

export const SITE_IDS = ['chatgpt', 'claude'] as const;
export const SiteIdSchema = z.enum(SITE_IDS);
export type SiteId = z.infer<typeof SiteIdSchema>;

export const SETTINGS_VERSION = 1;

export const SettingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  provider: ProviderIdSchema,
  models: z.object({
    anthropic: z.string().min(1),
    openai: z.string().min(1),
  }),
  introLength: z.enum(['short', 'medium']),
  maxOutputTokens: z.number().int().min(64).max(32_000),
  contextBudgetTokens: z.number().int().min(500).max(100_000),
  hoverButtons: z.object({
    code: z.boolean(),
    table: z.boolean(),
    math: z.boolean(),
    paragraph: z.boolean(),
    list: z.boolean(),
    blockquote: z.boolean(),
  }),
  sites: z.object({
    chatgpt: z.boolean(),
    claude: z.boolean(),
  }),
  appearance: z.enum(['host', 'light', 'dark']),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** Keys live under a separate storage key and are only read by the background. */
export const ApiKeysSchema = z.object({
  anthropic: z.string().optional(),
  openai: z.string().optional(),
});
export type ApiKeys = z.infer<typeof ApiKeysSchema>;
