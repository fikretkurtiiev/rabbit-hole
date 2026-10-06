import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/** E2E builds pre-grant provider origins: the optional-permission prompt can't be clicked in automation. */
const E2E = process.env.RH_E2E === '1';
const PROVIDER_ORIGINS = ['https://api.anthropic.com/*', 'https://api.openai.com/*'];

const KATEX_STYLES_ID = 'virtual:katex-styles';

/**
 * KaTeX CSS without @font-face rules, as a string. Fonts can't load inside a shadow root anyway, and
 * the host sites already provide KaTeX fonts at document level. Importing katex.min.css?inline
 * would otherwise inline ~1.4 MB of fonts as base64.
 */
function katexStyles(): Plugin {
  const resolvedId = `\0${KATEX_STYLES_ID}`;
  return {
    name: 'rabbit-hole:katex-styles',
    resolveId: (id) => (id === KATEX_STYLES_ID ? resolvedId : undefined),
    load(id) {
      if (id !== resolvedId) return undefined;
      const path = createRequire(import.meta.url).resolve('katex/dist/katex.min.css');
      const css = readFileSync(path, 'utf8').replace(/@font-face\s*{[^}]*}/g, '');
      return `export default ${JSON.stringify(css)};`;
    },
  };
}

/**
 * Escapes every non-ASCII character in emitted JS as \\uXXXX. Some dependencies ship regexes with
 * literal noncharacters (U+FFFF), which Chrome rejects as "isn't UTF-8 encoded" when loading the
 * content script. Escapes are valid in strings, templates, regexes and identifiers alike.
 */
function asciiOnlyOutput(): Plugin {
  return {
    name: 'rabbit-hole:ascii-only',
    enforce: 'post',
    // generateBundle sees the final, minified output (minifiers may turn escapes back into characters).
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && /[\u007f-\uffff]/.test(file.code)) {
          file.code = file.code.replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
        }
      }
    },
  };
}

export default defineConfig({
  srcDir: 'src',
  // MV3 for both browsers (WXT defaults Firefox to MV2).
  manifestVersion: 3,
  outDir: E2E ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss(), katexStyles(), asciiOnlyOutput()],
  }),
  manifest: ({ browser }) => ({
    name: 'Rabbit Hole',
    description: 'Dive into any part of an AI chat answer in an isolated side thread.',
    permissions: ['storage', 'contextMenus'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      'https://claude.ai/*',
      ...(E2E ? PROVIDER_ORIGINS : []),
    ],
    optional_host_permissions: PROVIDER_ORIGINS,
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'rabbit-hole@fikret.dev',
              // 140: CSS Custom Highlight API and data_collection_permissions.
              strict_min_version: '140.0',
              // Fragments of pages the user dives into are sent to the AI provider they configured.
              data_collection_permissions: { required: ['websiteContent'] },
            },
          },
        }
      : {}),
  }),
});
