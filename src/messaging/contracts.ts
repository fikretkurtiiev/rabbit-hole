import { z } from 'zod';
import { AnchorSchema } from '@/anchoring/types';
import { ProviderErrorCodeSchema } from '@/providers/errors';
import { FragmentTypeSchema, ProviderIdSchema } from '@/settings/schema';
import { ThreadMessageSchema, ThreadSchema } from '@/threads/model';

// ---------- One-shot requests (runtime.sendMessage) ----------

export const NewThreadInputSchema = z.object({
  site: z.string(),
  conversationId: z.string(),
  anchor: AnchorSchema,
  fragmentType: FragmentTypeSchema,
  fragmentMarkdown: z.string().min(1),
  sourceMarkdown: z.string(),
  userPromptMarkdown: z.string().nullable(),
  parentThreadId: z.string().optional(),
});
export type NewThreadInput = z.infer<typeof NewThreadInputSchema>;

export const RequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('getStatus') }),
  z.object({ type: z.literal('listThreads'), site: z.string(), conversationId: z.string() }),
  z.object({ type: z.literal('getThread'), id: z.string() }),
  z.object({ type: z.literal('createThread'), input: NewThreadInputSchema }),
  z.object({ type: z.literal('deleteThread'), id: z.string() }),
  z.object({ type: z.literal('setThreadStatus'), id: z.string(), status: z.enum(['active', 'orphaned']) }),
  z.object({ type: z.literal('openOptions') }),
  z.object({ type: z.literal('testKey'), provider: ProviderIdSchema }),
  z.object({ type: z.literal('listModels'), provider: ProviderIdSchema }),
]);
export type Request = z.infer<typeof RequestSchema>;

export const StatusSchema = z.object({
  hasKey: z.boolean(),
  provider: ProviderIdSchema,
  model: z.string(),
});
export type Status = z.infer<typeof StatusSchema>;

export const ThreadWithMessagesSchema = z.object({
  thread: ThreadSchema,
  messages: z.array(ThreadMessageSchema),
});
export type ThreadWithMessages = z.infer<typeof ThreadWithMessagesSchema>;

export const ResponseSchemas = {
  getStatus: StatusSchema,
  listThreads: z.array(ThreadSchema),
  getThread: ThreadWithMessagesSchema.nullable(),
  createThread: ThreadSchema,
  deleteThread: z.null(),
  setThreadStatus: z.null(),
  openOptions: z.null(),
  testKey: z.enum(['valid', 'invalid', 'network', 'rate_limited', 'error', 'no_key']),
  listModels: z.array(z.object({ id: z.string(), displayName: z.string() })),
} satisfies Record<Request['type'], z.ZodType>;

export type ResponseFor<T extends Request['type']> = z.infer<(typeof ResponseSchemas)[T]>;

/** Envelope so errors cross the boundary as data instead of rejected promises with lost types. */
export const EnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type Envelope = z.infer<typeof EnvelopeSchema>;

// ---------- Streaming (one runtime.Port per thread turn) ----------

export const STREAM_PORT_NAME = 'rabbit-hole:stream';

export const PortClientMessageSchema = z.discriminatedUnion('type', [
  /** Without `userText`: generate the intro (or answer a dangling user message). */
  z.object({ type: z.literal('start'), threadId: z.string(), userText: z.string().min(1).optional() }),
  z.object({ type: z.literal('abort') }),
]);
export type PortClientMessage = z.infer<typeof PortClientMessageSchema>;

export const PortServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('userMessage'), message: ThreadMessageSchema }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    message: ThreadMessageSchema,
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  }),
  z.object({ type: z.literal('error'), code: ProviderErrorCodeSchema, message: z.string() }),
]);
export type PortServerMessage = z.infer<typeof PortServerMessageSchema>;

// ---------- Background / popup -> content script ----------

export const ContentMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('contextMenuDive') }),
  z.object({ type: z.literal('openThread'), id: z.string() }),
]);
export type ContentMessage = z.infer<typeof ContentMessageSchema>;
