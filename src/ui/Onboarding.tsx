import { request } from '@/messaging/client';

export function Onboarding() {
  return (
    <div className="flex flex-1 flex-col items-start gap-3 p-4">
      <h2 className="text-base font-semibold">Add your API key</h2>
      <p className="text-rh-muted">
        Rabbit Hole explores answers in a separate side thread using your own Anthropic or OpenAI API key. Nothing has
        been sent anywhere, and the main chat is never touched.
      </p>
      <p className="text-xs text-rh-muted">Usage is billed to your own provider account.</p>
      <button
        type="button"
        className="rounded-lg bg-rh-accent px-3 py-2 text-sm font-medium text-white"
        onClick={() => void request({ type: 'openOptions' })}
      >
        Open Settings
      </button>
    </div>
  );
}
