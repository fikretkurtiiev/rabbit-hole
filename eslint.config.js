import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['.output', '.output-e2e', '.wxt', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Playwright fixtures call `use()`, which is not React's hook.
    files: ['tests/e2e/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    // The content script and its UI must never see API keys or call providers directly.
    files: ['src/entrypoints/content/**', 'src/ui/**', 'src/adapters/**', 'src/blocks/**', 'src/anchoring/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/settings/keys', '**/settings/keys'], message: 'Only the background and options page may read API keys.' },
            { group: ['@/providers', '@/providers/anthropic', '@/providers/openai', '@anthropic-ai/sdk'], message: 'Only the background talks to AI providers.' },
            { group: ['@/threads/repository', '@/threads/db', 'dexie'], message: 'Threads live in the extension origin; use messaging.' },
          ],
        },
      ],
    },
  },
);
