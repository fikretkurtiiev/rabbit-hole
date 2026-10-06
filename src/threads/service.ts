import type { NewThreadInput, PortServerMessage } from '@/messaging/contracts';
import { ProviderError, USER_MESSAGES } from '@/providers/errors';
import type { ChatProvider } from '@/providers/types';
import { buildContextPacket, type ParentContext } from '@/prompts/contextPacket';
import type { Settings } from '@/settings/schema';
import { MAX_THREAD_DEPTH, makeTitle, type Thread, type ThreadMessage } from './model';
import type { ThreadRepository } from './repository';

export async function createThreadFromInput(
  repo: ThreadRepository,
  input: NewThreadInput,
  settings: Settings,
): Promise<Thread> {
  let depth = 1;
  if (input.parentThreadId) {
    const parent = await repo.getThread(input.parentThreadId);
    if (!parent) throw new Error('Parent thread not found');
    depth = parent.depth + 1;
    if (depth > MAX_THREAD_DEPTH) throw new Error(`Dives can be nested at most ${MAX_THREAD_DEPTH} levels deep`);
  }
  const now = Date.now();
  const thread: Thread = {
    id: crypto.randomUUID(),
    ...input,
    title: makeTitle(input.fragmentMarkdown),
    depth,
    provider: settings.provider,
    model: settings.models[settings.provider],
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: now,
    updatedAt: now,
    status: 'active',
  };
  await repo.createThread(thread);
  return thread;
}

async function loadParents(repo: ThreadRepository, thread: Thread): Promise<ParentContext[]> {
  const parents: ParentContext[] = [];
  let parentId = thread.parentThreadId;
  while (parentId) {
    const parent = await repo.getThread(parentId);
    if (!parent) break;
    const intro = (await repo.listMessages(parent.id)).find((m) => m.role === 'assistant')?.content ?? '';
    parents.unshift({ fragmentType: parent.fragmentType, fragmentMarkdown: parent.fragmentMarkdown, intro });
    parentId = parent.parentThreadId;
  }
  return parents;
}

export interface RunTurnDeps {
  repo: ThreadRepository;
  settings: Settings;
  getProvider: (thread: Thread) => Promise<ChatProvider | null>;
  emit: (message: PortServerMessage) => void;
  signal: AbortSignal;
}

/** Runs one assistant turn for a thread: persists the user message, streams the answer, persists it with usage. */
export async function runTurn(threadId: string, userText: string | undefined, deps: RunTurnDeps): Promise<void> {
  const { repo, settings, emit, signal } = deps;
  const thread = await repo.getThread(threadId);
  if (!thread) {
    emit({ type: 'error', code: 'unknown', message: 'This thread no longer exists.' });
    return;
  }

  const provider = await deps.getProvider(thread);
  if (!provider) {
    emit({ type: 'error', code: 'no_key', message: USER_MESSAGES.no_key });
    return;
  }

  if (userText) {
    const userMessage: ThreadMessage = {
      id: crypto.randomUUID(),
      threadId,
      role: 'user',
      content: userText,
      createdAt: Date.now(),
    };
    await repo.addMessage(userMessage);
    emit({ type: 'userMessage', message: userMessage });
  }

  const history = (await repo.listMessages(threadId)).map(({ role, content }) => ({ role, content }));
  if (history.at(-1)?.role === 'assistant') return; // Nothing to answer.

  const packet = buildContextPacket({
    fragmentType: thread.fragmentType,
    fragmentMarkdown: thread.fragmentMarkdown,
    sourceMessageMarkdown: thread.sourceMarkdown,
    userPromptMarkdown: thread.userPromptMarkdown,
    history,
    parents: await loadParents(repo, thread),
    introLength: settings.introLength,
    contextBudgetTokens: settings.contextBudgetTokens,
  });

  let text = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  try {
    for await (const chunk of provider.streamChat(packet.messages, {
      model: thread.model,
      system: packet.system,
      maxOutputTokens: settings.maxOutputTokens,
      signal,
    })) {
      if (chunk.type === 'text') {
        text += chunk.text;
        emit({ type: 'delta', text: chunk.text });
      } else {
        usage = chunk.usage;
      }
    }
  } catch (error) {
    const providerError =
      error instanceof ProviderError ? error : new ProviderError('unknown', USER_MESSAGES.unknown);
    // Keep whatever was streamed before an abort so the user does not lose it.
    if (providerError.code === 'aborted' && text) {
      await persistAssistant(text + '\n\n*[stopped]*', usage);
      return;
    }
    if (usage.inputTokens || usage.outputTokens) await repo.addUsage(threadId, usage.inputTokens, usage.outputTokens);
    emit({ type: 'error', code: providerError.code, message: providerError.message });
    return;
  }
  await persistAssistant(text, usage);

  async function persistAssistant(content: string, turnUsage: typeof usage) {
    const message: ThreadMessage = {
      id: crypto.randomUUID(),
      threadId,
      role: 'assistant',
      content,
      createdAt: Date.now(),
    };
    await repo.addMessage(message);
    await repo.addUsage(threadId, turnUsage.inputTokens, turnUsage.outputTokens);
    emit({ type: 'done', message, usage: turnUsage });
  }
}
