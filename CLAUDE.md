# CLAUDE.md — Rabbit Hole

Browser extension (Chrome + Firefox) that lets the user dive into part of an AI chat response
(ChatGPT, Claude, Gemini, etc.) in a **side thread** shown in a floating popover, and explore
it with an AI **without touching the main conversation's context**. Think Slack threads meets
Wikipedia hover previews.

## The one rule that drives every decision

**The main chat must never be modified.** No typing into the host page's input, no hidden
messages, no calls to the host site's backend. Side threads run on a separate, isolated AI
session using the user's own API key. If a feature would require writing to the host chat,
it is out of scope.

## User flow

1. User reads an AI response on a supported site and starts a dive in one of two ways:
   - **Hover button**: hovering over a block inside an AI answer (code block, table, formula,
     paragraph, list) shows a small "Dive in" button in the block's top-right corner. One
     click opens a thread on the whole block.
   - **Text selection**: selecting any text inside an AI answer shows the same "Dive in"
     button next to the selection. Also available from the context menu.
2. If no API key is configured yet, the popover shows a short "Add your API key" screen with
   a button that opens Settings. Nothing is sent anywhere.
3. Otherwise a popover opens anchored to the block or selection and immediately streams a
   short, Wikipedia-style intro explaining the fragment in the context of the surrounding
   answer.
4. User continues chatting inside the popover. The popover can be dragged, resized, pinned,
   minimised to a badge, or closed.
5. The fragment gets a subtle highlight in the page. Clicking it reopens its thread.
6. Threads persist per conversation, so reloading the page or returning later restores the
   highlights and their threads.
7. Nested dives: hover buttons and selection also work inside popover answers, opening a
   child thread (max depth 3, shown as a depth indicator on the popover).

There are no hotkeys and no screenshots. Everything is driven by hover, click and selection.

## Tech stack

- **WXT** (Manifest V3, builds for both Chrome and Firefox from one codebase)
- **TypeScript** in strict mode everywhere
- **React 19** for UI (popover, hover button, options page, toolbar popup)
- **Tailwind CSS**, compiled and injected into a Shadow DOM root (never into the host page)
- **Zustand** for popover/UI state inside the content script
- **Dexie (IndexedDB)** for threads and anchors; `browser.storage.local` for settings and keys
- **Turndown** + `turndown-plugin-gfm` to convert selected/hovered HTML to Markdown
- **webextension-polyfill** via WXT's `browser` global — never use `chrome.*` directly
- **Vitest** for unit tests, **Playwright** for e2e (Chromium with the unpacked extension)
- **web-ext** for Firefox linting and running

## Scripts

```bash
pnpm install
pnpm dev              # Chrome, hot reload
pnpm dev:firefox      # Firefox, hot reload
pnpm build            # Chrome production build -> .output/chrome-mv3
pnpm build:firefox    # Firefox production build -> .output/firefox-mv3
pnpm zip && pnpm zip:firefox   # store-ready archives (+ sources zip for AMO review)
pnpm typecheck
pnpm lint
pnpm test             # Vitest
pnpm test:e2e         # Playwright against local fixture pages
pnpm lint:firefox     # web-ext lint on the Firefox build
```

Run `pnpm typecheck && pnpm lint && pnpm test` before considering any task done.

## Architecture

```
src/
  entrypoints/
    background.ts          # Only place that talks to AI providers and reads API keys
    content/               # Block detection, hover button, selection, anchoring, UI mount
    options/               # Settings page (see Settings)
    popup/                 # Toolbar popup: threads for the current conversation + status
  adapters/                # One file per host site + a generic fallback
    types.ts               # SiteAdapter interface
    chatgpt.ts
    claude.ts
    gemini.ts
    generic.ts
  blocks/                  # Block detection and per-type extractors (code, table, math, ...)
  anchoring/               # Text-quote and block anchors, re-anchoring, highlights
  providers/               # AI provider clients behind a single interface
    types.ts               # ChatProvider interface
    anthropic.ts
    openai.ts
  settings/                # Settings schema (Zod), defaults, storage access, migrations
                           # (keys.ts = API keys; ESLint blocks it outside background/options)
  threads/                 # Thread model, Dexie schema, repository
  messaging/               # Typed message contracts between content <-> background
  ui/                      # React components (Popover, ThreadView, Composer, DiveButton)
  prompts/                 # System prompt and context-packet builders
```

### Process boundaries

- **Content script**: reads the DOM, renders all UI inside one Shadow DOM, sends typed
  messages to the background. It never sees API keys and never calls AI providers.
- **Background**: owns provider clients, reads keys from storage, streams responses back to
  the content script over a long-lived `runtime.Port` per thread.
- **Options page**: writes settings and keys to `browser.storage.local`; validates keys by
  asking the background to test them.
- **Threads** live in the extension origin's IndexedDB (background/options/popup), never in the
  host page's IndexedDB. The content script reads and writes them only through messaging.
- **Firefox note**: MV3 background is an event page in Firefox and a service worker in Chrome.
  Code must not rely on the background being long-lived. Keep no essential state in
  background memory; persist to IndexedDB or storage.

### Site adapters

Every supported site implements `SiteAdapter`:

```ts
interface SiteAdapter {
  id: string;                                  // 'chatgpt', 'claude', ...
  matches(url: URL): boolean;
  getConversationId(url: URL): string | null;  // key for persisting threads
  getContentRoot(): HTMLElement | null;        // container to observe for mutations
  findMessageElement(node: Node): HTMLElement | null;  // AI message containing a node
  getMessageRole(el: HTMLElement): 'user' | 'assistant' | null;
  isStreaming(el: HTMLElement): boolean;       // answer still being generated
  getMessageMarkdown(el: HTMLElement): string; // clean Markdown, no UI chrome
  getPrecedingUserMessage(el: HTMLElement): string | null;
  getThemeHint(): 'light' | 'dark' | null;
  listAssistantMessages(): HTMLElement[];      // document order; index is the anchor hint
  buttonOffset?(type: BlockType): ButtonOffset; // keep the Dive button clear of host controls
  codeLanguage?(pre: HTMLElement): string | null; // when <code> has no language-* class
}
```

Rules:
- Selectors for host sites change often. Keep all of them inside the adapter files, prefer
  stable attributes (`data-*`, roles, ARIA) over generated class names, and add a fixture
  test for each adapter using a saved HTML snapshot under `tests/fixtures/<site>/`.
- If an adapter fails, fall back to `generic.ts`. The extension must degrade, never crash.
- Hosts are SPAs. Detect conversation changes via URL changes (`wxt:locationchange`) and
  re-run block detection and anchoring.

## Hover buttons on blocks

### Which blocks

Only blocks inside **assistant** messages (and inside Rabbit Hole popover answers). Never on
user messages, sidebars, inputs or other page chrome.

| Block type | Detection                                    | Extracted as                         |
|------------|----------------------------------------------|--------------------------------------|
| Code       | `pre > code`                                 | fenced code, language from `language-*` class |
| Table      | `table`                                      | GFM Markdown table                   |
| Math       | `.katex`, `mjx-container`                    | LaTeX source (`annotation[encoding="application/x-tex"]`, MathJax `data-latex` or assistive MathML) |
| Paragraph  | `p`                                          | Markdown                             |
| List       | top-level `ul` / `ol` inside the message     | Markdown                             |
| Blockquote | `blockquote`                                 | Markdown                             |

Inline math inside a paragraph belongs to the paragraph; display math is its own block.
Images, SVG diagrams and canvas charts are out of scope for now. Each block type can be
toggled in Settings (paragraph buttons can feel noisy for some users).

### Behaviour

- One shared `DiveButton` instance lives in the Shadow DOM and is repositioned with
  `@floating-ui/dom` to the hovered block's top-right corner. Do not inject a button into
  every block, and do not insert anything into the host's DOM tree.
- Show after a short hover delay (~150 ms), hide ~300 ms after the pointer leaves both the
  block and the button, so moving the mouse onto the button never makes it vanish.
- Use event delegation: one `pointerover` listener on the adapter's content root, resolve the
  nearest block with `closest()`, throttle with `requestAnimationFrame`.
- Hidden while the user is selecting text (pointer button down) and while the message
  `isStreaming`.
- On touch devices and for keyboard users, the context menu and text selection paths remain
  available. The button itself is focusable with a clear label (`Dive into this code block`).
- The button must never cover the host's own block controls (e.g. the "Copy" button on code
  blocks). Adapters can provide an offset per block type.

### Text selection

- Selection inside an assistant message shows the same button next to the selection end.
- Convert the selection to Markdown with `Range.cloneContents()` + Turndown, so code, tables
  and math inside the selection keep their structure (reuse the block extractors for math).

## Context packet (what the side thread sends to the AI)

Built in `prompts/contextPacket.ts`:

1. The fragment (block or selection) as Markdown, labelled with its block type.
2. The full assistant message that contains it, as Markdown.
3. The user message that prompted that answer.
4. The thread's own message history (and, for nested threads, the parent thread's fragment
   and intro, not the whole parent thread).

The rest of the main conversation is never sent. Items 2 and 3 have a token budget
(default 6k, configurable); truncate around the fragment, not from the start.

The first turn uses a system prompt asking for a short, encyclopedia-style explanation of the
fragment (3–6 sentences, length configurable), then the thread switches to normal
conversational mode.

## Settings (BYOK — bring your own key)

Rabbit Hole never provides AI access itself: no backend, no shared key, no free tier. Every
user connects their own paid provider account and all usage is billed to them.

### Settings panel (options page, also linked from the toolbar popup)

- **Provider**: Anthropic or OpenAI (more later, behind the same interface).
- **API key** per provider: password field with show/hide, "Test key" and "Remove key"
  buttons. Keys for several providers can be stored; only the selected provider is used.
- **Model**: dropdown populated from the provider's models endpoint after a successful key
  test, with a sensible default per provider.
- **Answer settings**: intro length (short / medium), max output tokens, context budget.
- **Hover buttons**: on/off per block type.
- **Sites**: enable/disable per supported site.
- **Appearance**: follow host theme / light / dark.
- **Data**: export threads (JSON), import, delete all threads, delete all data and keys.
- A clear notice that usage is billed to the user's own provider account.

### Key handling

- Keys are stored in `browser.storage.local` only, never `storage.sync`, never in IndexedDB,
  never logged, never sent anywhere except the selected provider's API.
- Only the background reads keys. The content script receives only `hasKey: boolean`.
- "Test key" calls the provider's models list endpoint (no token cost) and reports
  valid / invalid / no network / rate limited.
- Provider API domains are `optional_host_permissions`, requested when the user saves a key
  for that provider. If the user refuses the permission, show why it is needed.

### Providers

- `ChatProvider` interface: `streamChat(messages, opts): AsyncIterable<Chunk>` with abort
  support, plus `listModels()` and `testKey()`.
- **Anthropic**: Messages API with `x-api-key` and `anthropic-version` headers. Requests from a
  browser context also need `anthropic-dangerous-direct-browser-access: true`.
- **OpenAI**: Chat Completions (or Responses) API with `Authorization: Bearer`.
- Map provider errors to user-friendly messages in the popover: invalid key, insufficient
  credits/quota, rate limit (retry with backoff), model not available, network error.
- Record token usage from each response and show it per thread (input/output tokens) so users
  can see what dives cost them.

## Anchoring and highlights

- Selection anchors: W3C Web Annotation-style **text quote selectors** (`exact` plus `prefix`
  and `suffix`, ~32 chars each) plus the message index as a hint.
- Block anchors: message index + block type + block ordinal within the message + a short
  hash of the block's extracted content; fall back to a text quote of its first line.
- Re-anchor on load and on DOM mutations (debounced `MutationObserver` on the adapter's
  content root). Use fuzzy matching when the exact quote is not found; mark threads as
  "orphaned" rather than deleting them.
- Render highlights with the CSS Custom Highlight API (`CSS.highlights`) where available, with
  a namespaced `<mark>` fallback for selections. Blocks get a thin outline drawn from the
  Shadow DOM layer, not a style change on the host element.

## Data model (Dexie)

```ts
Thread  { id, site, conversationId, anchor, fragmentType, fragmentMarkdown,
          sourceMarkdown, userPromptMarkdown,   // snapshot of the context, so threads survive page changes
          title, parentThreadId?, depth, provider, model, usage: { inputTokens, outputTokens },
          createdAt, updatedAt, status: 'active' | 'orphaned' }
Message { id, threadId, role: 'user' | 'assistant', content, createdAt }
```

## UI conventions

- All injected UI lives in a single Shadow DOM host (`<rabbit-hole-root>`). Never inject global
  styles into the host page and never depend on the host's CSS.
- Popover positioning with `@floating-ui/dom`; keep it on-screen, flip when needed.
- Render AI responses as Markdown (`react-markdown` + `remark-gfm`), sanitised, with code
  highlighting and KaTeX for math. No `dangerouslySetInnerHTML` with unsanitised content.
- Respect the host's light/dark theme and `prefers-reduced-motion`.
- Keyboard accessible: `Esc` closes the popover, focus is trapped in the composer while
  active and returned to the fragment on close.
- Several popovers may be open at once; the most recent one is on top.

## Code conventions

- Strict TypeScript, no `any`. Validate every cross-context message and the settings object
  with Zod schemas.
- Functional React components and hooks only.
- Small, pure functions for block extraction, anchoring and context building.
- No analytics, no telemetry, no remote code. Everything ships in the bundle (MV3 and AMO
  review requirement).
- Named exports; one component per file; colocate tests as `*.test.ts(x)`.
- Conventional Commits.

## Testing

- Unit: each block extractor (code language detection, GFM tables, KaTeX/MathJax LaTeX
  recovery), selection-to-Markdown, anchoring (exact, fuzzy, orphan), context packet
  truncation, each adapter against its HTML fixture, provider stream parsing and error
  mapping (mocked `fetch`), settings schema migrations.
- E2E: local fixture pages that mimic each supported site; test hover → button → popover →
  streamed answer (mocked provider) → close → reload → highlight restored; and the
  "no API key" onboarding path.
- Before each release, manually smoke test on the real sites in both browsers.

## Permissions (keep minimal)

- `storage`, `contextMenus`
- Host permissions only for the supported chat sites
- `optional_host_permissions` for provider API domains (`api.anthropic.com`, `api.openai.com`)
- Firefox: set `browser_specific_settings.gecko.id` in `wxt.config.ts`

## Out of scope (for now)

- Writing anything into the host chat, or using the host site's own backend/session
- Screenshots and images, SVG diagrams, canvas charts
- Providing AI access, a backend, or any paid plan
- Syncing threads across devices
- Mobile browsers

## Roadmap

1. MVP: Chrome, ChatGPT + Claude adapters, hover buttons (code, table, math, paragraph),
   text selection, Settings with Anthropic + OpenAI BYOK, persistence.
2. Firefox build parity and AMO submission (with sources zip).
3. Gemini adapter, nested threads, thread list in the toolbar popup, export/import.
4. "Promote to main chat": copy a concise summary of a thread to the clipboard so the user
   can paste it into the main chat if they decide it belongs there.
