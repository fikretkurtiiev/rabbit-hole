import Dexie, { type EntityTable } from 'dexie';
import type { Thread, ThreadMessage } from './model';

export class RabbitHoleDb extends Dexie {
  threads!: EntityTable<Thread, 'id'>;
  messages!: EntityTable<ThreadMessage, 'id'>;

  constructor(name = 'rabbit-hole') {
    super(name);
    this.version(1).stores({
      threads: 'id, [site+conversationId], parentThreadId, updatedAt',
      messages: 'id, threadId, [threadId+createdAt]',
    });
  }
}
