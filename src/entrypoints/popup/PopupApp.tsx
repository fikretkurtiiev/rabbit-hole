import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { adapterForUrl } from '@/adapters';
import { request } from '@/messaging/client';
import type { ContentMessage, Status } from '@/messaging/contracts';
import { loadSettings } from '@/settings/storage';
import type { Thread } from '@/threads/model';
import { usePageTheme } from '@/ui/usePageTheme';

type PageState =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'disabled'; site: string }
  | { kind: 'ready'; tabId: number; threads: Thread[] };

export function PopupApp() {
  const theme = usePageTheme();
  const [status, setStatus] = useState<Status | null>(null);
  const [page, setPage] = useState<PageState>({ kind: 'loading' });

  useEffect(() => {
    void request({ type: 'getStatus' }).then(setStatus).catch(() => setStatus(null));
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ? new URL(tab.url) : null;
      const adapter = url ? adapterForUrl(url) : null;
      if (!tab?.id || !url || !adapter) {
        setPage({ kind: 'unsupported' });
        return;
      }
      const settings = await loadSettings();
      if (!settings.sites[adapter.id as keyof typeof settings.sites]) {
        setPage({ kind: 'disabled', site: adapter.id });
        return;
      }
      const conversationId = adapter.getConversationId(url) ?? `path:${url.pathname}`;
      const threads = await request({ type: 'listThreads', site: adapter.id, conversationId });
      setPage({ kind: 'ready', tabId: tab.id, threads });
    })().catch(() => setPage({ kind: 'unsupported' }));
  }, []);

  const openThread = (tabId: number, id: string) => {
    void browser.tabs.sendMessage(tabId, { type: 'openThread', id } satisfies ContentMessage).finally(() => window.close());
  };

  const totals =
    page.kind === 'ready'
      ? page.threads.reduce(
          (acc, t) => ({ input: acc.input + t.usage.inputTokens, output: acc.output + t.usage.outputTokens }),
          { input: 0, output: 0 },
        )
      : null;

  return (
    <div className="rh-root w-80 bg-rh-bg p-3" data-theme={theme}>
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold">Rabbit Hole</h1>
        <button
          type="button"
          onClick={() => void request({ type: 'openOptions' }).then(() => window.close())}
          className="text-sm text-rh-accent underline"
        >
          Settings
        </button>
      </header>

      {status && (
        <p className="mb-3 rounded-lg bg-rh-surface px-3 py-2 text-xs text-rh-muted">
          {status.hasKey ? (
            <>
              Using <span className="text-rh-text">{status.model}</span> ({status.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'})
            </>
          ) : (
            <span className="text-rh-danger">No API key yet. Add one in Settings to start diving.</span>
          )}
        </p>
      )}

      {page.kind === 'loading' && <p className="text-sm text-rh-muted">Loading…</p>}
      {page.kind === 'unsupported' && (
        <p className="text-sm text-rh-muted">Open a conversation on ChatGPT or Claude to see its dives here.</p>
      )}
      {page.kind === 'disabled' && <p className="text-sm text-rh-muted">Rabbit Hole is turned off for this site in Settings.</p>}
      {page.kind === 'ready' &&
        (page.threads.length === 0 ? (
          <p className="text-sm text-rh-muted">
            No dives in this conversation yet. Hover a block in an answer or select text and click “Dive in”.
          </p>
        ) : (
          <>
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {page.threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => openThread(page.tabId, thread.id)}
                    className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-rh-surface"
                    style={{ paddingLeft: `${0.5 + (thread.depth - 1) * 0.75}rem` }}
                  >
                    <div className="truncate text-sm">{thread.title}</div>
                    <div className="text-[11px] text-rh-muted">
                      {thread.fragmentType}
                      {thread.status === 'orphaned' && ' · fragment not found'} · {thread.usage.inputTokens + thread.usage.outputTokens}{' '}
                      tokens
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {totals && (
              <p className="mt-2 border-t border-rh-border pt-2 text-[11px] text-rh-muted">
                This conversation: {totals.input} input · {totals.output} output tokens
              </p>
            )}
          </>
        ))}
    </div>
  );
}
