# Rabbit Hole

A browser extension for Chrome and Firefox. It lets you dive into any part of an AI chat answer
in a **side thread** without touching the main conversation.

Hover a code block, table, formula, paragraph or list in a ChatGPT or Claude answer, or select
some text, and click **Dive in**. A floating popover opens with a short, encyclopedia-style
explanation of that fragment, and you can keep asking questions there. The main chat never
sees any of it.

Think Slack threads meets Wikipedia hover previews.

## Features

- **Hover buttons** on code blocks, tables, math, paragraphs and lists in assistant answers
  (each type can be turned off in Settings).
- **Text selection** works for any part of an answer, and so does the context menu entry.
- **Isolated side threads** run on a separate AI session that uses your own API key. Rabbit
  Hole never types into, sends to, or calls the host chat's backend.
- **Context-aware**: the AI sees the fragment, the answer it came from and the question that
  prompted it. It never sees the rest of your conversation.
- **Popovers** can be dragged, resized, pinned, minimised and stacked.
- **Highlights**: dived fragments stay highlighted, and clicking one reopens its thread.
- **Persistence**: threads are saved per conversation and restored when you come back.
- **Nested dives** go up to three levels deep, starting from answers inside the popover.
- **Token usage** is shown per thread, so you can see what each dive costs.

## Supported sites

| Site    | Status    |
|---------|-----------|
| ChatGPT | Supported |
| Claude  | Supported |
| Gemini  | Planned   |
| Others  | Generic fallback adapter (best effort) |

## Bring your own key

Rabbit Hole has no backend, no shared key and no free tier. You connect your own provider
account, and **all usage is billed to that account**.

Supported providers are **Anthropic** and **OpenAI**.

Your keys:
- are stored only in `browser.storage.local` (never synced, never in IndexedDB, never logged)
- are read only by the extension's background script, never by the page's content script
- are sent only to the provider you selected

Provider API domains are requested as optional permissions when you save a key.

## Installation (from source)

Requirements: Node.js and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm build            # Chrome  -> .output/chrome-mv3
pnpm build:firefox    # Firefox -> .output/firefox-mv3
```

- **Chrome**: open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and
  choose `.output/chrome-mv3`.
- **Firefox** (140+): open `about:debugging#/runtime/this-firefox`, click **Load Temporary
  Add-on** and choose `manifest.json` in `.output/firefox-mv3`.

Then open the extension's Settings, choose a provider, paste your API key and click
**Test key**.

## Development

```bash
pnpm dev              # Chrome with hot reload
pnpm dev:firefox      # Firefox with hot reload

pnpm typecheck
pnpm lint
pnpm test             # Vitest unit tests
pnpm test:e2e         # Playwright e2e against local fixture pages
pnpm lint:firefox     # web-ext lint on the Firefox build

pnpm zip && pnpm zip:firefox   # store-ready archives
```

Run `pnpm typecheck && pnpm lint && pnpm test` before you open a PR.

### Tech stack

WXT (Manifest V3), TypeScript (strict), React 19, Tailwind CSS (inside a Shadow DOM), Zustand,
Dexie (IndexedDB), Turndown, Zod, `@floating-ui/dom`, `react-markdown` with KaTeX and syntax
highlighting, Vitest and Playwright.

### Project layout

```
src/
  entrypoints/   background (providers + keys), content script, options page, toolbar popup
  adapters/      one adapter per host site + generic fallback
  blocks/        block detection and extractors (code, table, math, ...)
  anchoring/     text-quote / block anchors and highlights
  providers/     Anthropic and OpenAI clients behind one interface
  settings/      Zod schema, defaults, storage, migrations
  threads/       thread model, Dexie schema, repository
  messaging/     typed content <-> background contracts
  prompts/       system prompt and context packet builder
  ui/            React components rendered in the Shadow DOM
tests/
  e2e/           Playwright specs
  fixtures/      saved HTML snapshots per site
```

See [CLAUDE.md](CLAUDE.md) for the full design notes and conventions.

## Privacy

- No analytics, no telemetry, no remote code.
- Only the fragment you dive into, its surrounding answer and the prompting question are sent,
  and only to the AI provider you configured.
- Threads are stored locally in the extension's IndexedDB. You can export, import or delete
  them from Settings.

## Roadmap

1. MVP: Chrome, ChatGPT and Claude adapters, hover buttons, text selection, Anthropic and
   OpenAI BYOK, persistence.
2. Firefox parity and AMO submission.
3. Gemini adapter, nested threads, thread list in the toolbar popup, export and import.
4. "Promote to main chat": copy a short thread summary to the clipboard.
