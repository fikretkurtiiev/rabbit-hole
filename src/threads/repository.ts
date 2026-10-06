import Dexie from 'dexie';
import { z } from 'zod';
import { RabbitHoleDb } from './db';
import { ThreadMessageSchema, ThreadSchema, type Thread, type ThreadMessage } from './model';

export const ExportFileSchema = z.object({
  format: z.literal('rabbit-hole-export'),
  version: z.literal(1),
  exportedAt: z.number(),
  threads: z.array(ThreadSchema),
  messages: z.array(ThreadMessageSchema),
});
export type ExportFile = z.infer<typeof ExportFileSchema>;

export function createThreadRepository(db = new RabbitHoleDb()) {
  return {
    async createThread(thread: Thread): Promise<void> {
      await db.threads.put(ThreadSchema.parse(thread));
    },

    async getThread(id: string): Promise<Thread | undefined> {
      return db.threads.get(id);
    },

    async listThreads(site: string, conversationId: string): Promise<Thread[]> {
      const threads = await db.threads.where('[site+conversationId]').equals([site, conversationId]).toArray();
      return threads.sort((a, b) => a.createdAt - b.createdAt);
    },

    async updateThread(id: string, patch: Partial<Omit<Thread, 'id'>>): Promise<void> {
      await db.threads.update(id, { ...patch, updatedAt: Date.now() });
    },

    async addUsage(id: string, inputTokens: number, outputTokens: number): Promise<void> {
      await db.transaction('rw', db.threads, async () => {
        const thread = await db.threads.get(id);
        if (!thread) return;
        await db.threads.update(id, {
          usage: {
            inputTokens: thread.usage.inputTokens + inputTokens,
            outputTokens: thread.usage.outputTokens + outputTokens,
          },
          updatedAt: Date.now(),
        });
      });
    },

    /** Deletes a thread with its messages and all descendant threads. */
    async deleteThread(id: string): Promise<void> {
      await db.transaction('rw', db.threads, db.messages, async () => {
        const queue = [id];
        while (queue.length > 0) {
          const current = queue.shift()!;
          const children = await db.threads.where('parentThreadId').equals(current).primaryKeys();
          queue.push(...children);
          await db.messages.where('threadId').equals(current).delete();
          await db.threads.delete(current);
        }
      });
    },

    async addMessage(message: ThreadMessage): Promise<void> {
      await db.messages.put(ThreadMessageSchema.parse(message));
    },

    async listMessages(threadId: string): Promise<ThreadMessage[]> {
      return db.messages.where('[threadId+createdAt]').between([threadId, Dexie.minKey], [threadId, Dexie.maxKey]).toArray();
    },

    async exportAll(): Promise<ExportFile> {
      return {
        format: 'rabbit-hole-export',
        version: 1,
        exportedAt: Date.now(),
        threads: await db.threads.toArray(),
        messages: await db.messages.toArray(),
      };
    },

    async importAll(raw: unknown): Promise<{ threads: number; messages: number }> {
      const data = ExportFileSchema.parse(raw);
      await db.transaction('rw', db.threads, db.messages, async () => {
        await db.threads.bulkPut(data.threads);
        await db.messages.bulkPut(data.messages);
      });
      return { threads: data.threads.length, messages: data.messages.length };
    },

    async deleteAll(): Promise<void> {
      await db.transaction('rw', db.threads, db.messages, async () => {
        await db.threads.clear();
        await db.messages.clear();
      });
    },
  };
}

export type ThreadRepository = ReturnType<typeof createThreadRepository>;
