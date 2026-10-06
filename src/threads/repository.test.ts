import { RabbitHoleDb } from './db';
import { makeTitle, type Thread } from './model';
import { createThreadRepository } from './repository';

let counter = 0;
function thread(overrides: Partial<Thread> = {}): Thread {
  counter += 1;
  return {
    id: `t${counter}`,
    site: 'chatgpt',
    conversationId: 'c1',
    anchor: { kind: 'selection', messageIndex: 0, quote: { exact: 'x', prefix: '', suffix: '' } },
    fragmentType: 'selection',
    fragmentMarkdown: 'x',
    sourceMarkdown: 'x',
    userPromptMarkdown: null,
    title: 'x',
    depth: 1,
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: counter,
    updatedAt: counter,
    status: 'active',
    ...overrides,
  };
}

describe('thread repository', () => {
  let repo: ReturnType<typeof createThreadRepository>;
  beforeEach(() => {
    repo = createThreadRepository(new RabbitHoleDb(`test-${Math.random()}`));
  });

  it('lists threads per conversation in creation order', async () => {
    await repo.createThread(thread({ id: 'b', createdAt: 2 }));
    await repo.createThread(thread({ id: 'a', createdAt: 1 }));
    await repo.createThread(thread({ id: 'other', conversationId: 'c2' }));
    expect((await repo.listThreads('chatgpt', 'c1')).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('accumulates usage', async () => {
    await repo.createThread(thread({ id: 'u' }));
    await repo.addUsage('u', 10, 5);
    await repo.addUsage('u', 1, 2);
    expect((await repo.getThread('u'))?.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  });

  it('deletes a thread with its messages and children', async () => {
    await repo.createThread(thread({ id: 'p' }));
    await repo.createThread(thread({ id: 'child', parentThreadId: 'p', depth: 2 }));
    await repo.addMessage({ id: 'm1', threadId: 'child', role: 'user', content: 'q', createdAt: 1 });
    await repo.deleteThread('p');
    expect(await repo.getThread('child')).toBeUndefined();
    expect(await repo.listMessages('child')).toEqual([]);
  });

  it('round-trips export and import', async () => {
    await repo.createThread(thread({ id: 'e' }));
    await repo.addMessage({ id: 'm2', threadId: 'e', role: 'assistant', content: 'a', createdAt: 2 });
    await repo.addMessage({ id: 'm1', threadId: 'e', role: 'user', content: 'q', createdAt: 1 });
    const dump = await repo.exportAll();
    await repo.deleteAll();
    expect(await repo.importAll(JSON.parse(JSON.stringify(dump)))).toEqual({ threads: 1, messages: 2 });
    expect((await repo.listMessages('e')).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('rejects malformed imports', async () => {
    await expect(repo.importAll({ format: 'nope' })).rejects.toThrow();
  });
});

describe('makeTitle', () => {
  it('uses the first meaningful line', () => {
    expect(makeTitle('```ts\nconst x = 1;\n```')).toBe('const x = 1;');
    expect(makeTitle('## Heading\nbody')).toBe('Heading');
    expect(makeTitle('```ts\nconst f = () => x;\n```')).toBe('const f = () => x;');
    expect(makeTitle('> **quoted** text')).toBe('quoted text');
    expect(makeTitle('')).toBe('Untitled dive');
    expect(makeTitle('a'.repeat(100))).toHaveLength(58);
  });
});
