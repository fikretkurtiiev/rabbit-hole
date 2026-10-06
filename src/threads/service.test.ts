import type { PortServerMessage } from '@/messaging/contracts';
import { ProviderError } from '@/providers/errors';
import type { ChatProvider, Chunk } from '@/providers/types';
import { DEFAULT_SETTINGS } from '@/settings/defaults';
import { RabbitHoleDb } from './db';
import { createThreadRepository } from './repository';
import { createThreadFromInput, runTurn } from './service';

function fakeProvider(chunks: Chunk[], fail?: ProviderError): ChatProvider & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    id: 'anthropic',
    calls,
    async *streamChat(messages, opts) {
      calls.push([messages, opts]);
      for (const chunk of chunks) yield chunk;
      if (fail) throw fail;
    },
    listModels: async () => [],
    testKey: async () => 'valid',
  };
}

const input = {
  site: 'chatgpt',
  conversationId: 'c',
  anchor: { kind: 'selection' as const, messageIndex: 0, quote: { exact: 'frag', prefix: '', suffix: '' } },
  fragmentType: 'selection' as const,
  fragmentMarkdown: 'frag',
  sourceMarkdown: 'the answer with frag inside',
  userPromptMarkdown: 'question',
};

describe('thread service', () => {
  let repo: ReturnType<typeof createThreadRepository>;
  beforeEach(() => {
    repo = createThreadRepository(new RabbitHoleDb(`svc-${Math.random()}`));
  });

  async function run(threadId: string, userText: string | undefined, provider: ChatProvider | null) {
    const events: PortServerMessage[] = [];
    await runTurn(threadId, userText, {
      repo,
      settings: DEFAULT_SETTINGS,
      getProvider: async () => provider,
      emit: (event) => events.push(event),
      signal: new AbortController().signal,
    });
    return events;
  }

  it('streams the intro, persists it and records usage', async () => {
    const thread = await createThreadFromInput(repo, input, DEFAULT_SETTINGS);
    const provider = fakeProvider([
      { type: 'text', text: 'An ' },
      { type: 'text', text: 'intro.' },
      { type: 'usage', usage: { inputTokens: 100, outputTokens: 4 } },
    ]);
    const events = await run(thread.id, undefined, provider);
    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'done']);
    const messages = await repo.listMessages(thread.id);
    expect(messages.map((m) => [m.role, m.content])).toEqual([['assistant', 'An intro.']]);
    expect((await repo.getThread(thread.id))?.usage).toEqual({ inputTokens: 100, outputTokens: 4 });
  });

  it('persists the user message before answering a follow-up', async () => {
    const thread = await createThreadFromInput(repo, input, DEFAULT_SETTINGS);
    await run(thread.id, undefined, fakeProvider([{ type: 'text', text: 'intro' }]));
    const provider = fakeProvider([{ type: 'text', text: 'answer' }]);
    const events = await run(thread.id, 'why?', provider);
    expect(events[0]?.type).toBe('userMessage');
    const sent = provider.calls[0]![0] as { role: string }[];
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('reports a missing key without calling anything', async () => {
    const thread = await createThreadFromInput(repo, input, DEFAULT_SETTINGS);
    expect(await run(thread.id, undefined, null)).toEqual([expect.objectContaining({ type: 'error', code: 'no_key' })]);
  });

  it('emits mapped provider errors', async () => {
    const thread = await createThreadFromInput(repo, input, DEFAULT_SETTINGS);
    const events = await run(thread.id, undefined, fakeProvider([], new ProviderError('quota', 'out of credits')));
    expect(events).toEqual([{ type: 'error', code: 'quota', message: 'out of credits' }]);
  });

  it('enforces the maximum nesting depth', async () => {
    const t1 = await createThreadFromInput(repo, input, DEFAULT_SETTINGS);
    const t2 = await createThreadFromInput(repo, { ...input, parentThreadId: t1.id }, DEFAULT_SETTINGS);
    const t3 = await createThreadFromInput(repo, { ...input, parentThreadId: t2.id }, DEFAULT_SETTINGS);
    expect(t3.depth).toBe(3);
    await expect(createThreadFromInput(repo, { ...input, parentThreadId: t3.id }, DEFAULT_SETTINGS)).rejects.toThrow(/at most 3/);
  });
});
