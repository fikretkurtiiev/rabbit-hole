import { useState } from 'react';
import { clearAllStorage } from '@/settings/keys';
import { createThreadRepository } from '@/threads/repository';
import { Section } from './Section';

// Same extension origin as the background, so the options page can use IndexedDB directly.
const repo = createThreadRepository();

export function DataSection() {
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'threads' | 'everything' | null>(null);

  const exportThreads = async () => {
    const data = await repo.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rabbit-hole-threads-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${data.threads.length} threads.`);
  };

  const importThreads = async (file: File) => {
    try {
      const result = await repo.importAll(JSON.parse(await file.text()));
      setMessage(`Imported ${result.threads} threads and ${result.messages} messages.`);
    } catch {
      setMessage('That file is not a valid Rabbit Hole export.');
    }
  };

  const confirmDelete = async () => {
    if (confirming === 'threads') {
      await repo.deleteAll();
      setMessage('All threads deleted.');
    } else if (confirming === 'everything') {
      await repo.deleteAll();
      await clearAllStorage();
      setMessage('All threads, settings and API keys deleted.');
    }
    setConfirming(null);
  };

  return (
    <Section title="Data" description="Threads are stored only in this browser. Nothing is synced.">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void exportThreads()} className="rounded-lg border border-rh-border px-3 py-1.5 text-sm">
          Export threads (JSON)
        </button>
        <label className="cursor-pointer rounded-lg border border-rh-border px-3 py-1.5 text-sm">
          Import…
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importThreads(file);
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => setConfirming('threads')}
          className="rounded-lg border border-rh-border px-3 py-1.5 text-sm text-rh-danger"
        >
          Delete all threads
        </button>
        <button
          type="button"
          onClick={() => setConfirming('everything')}
          className="rounded-lg border border-rh-danger px-3 py-1.5 text-sm text-rh-danger"
        >
          Delete all data and keys
        </button>
      </div>
      {confirming && (
        <div role="alertdialog" className="flex items-center gap-3 rounded-lg bg-rh-surface p-3 text-sm">
          <span className="flex-1">
            {confirming === 'threads' ? 'Delete every thread? This cannot be undone.' : 'Delete all threads, settings and API keys? This cannot be undone.'}
          </span>
          <button type="button" onClick={() => void confirmDelete()} className="rounded-lg bg-rh-danger px-3 py-1.5 text-white">
            Delete
          </button>
          <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-rh-border px-3 py-1.5">
            Cancel
          </button>
        </div>
      )}
      {message && <p role="status" className="text-sm text-rh-muted">{message}</p>}
    </Section>
  );
}
