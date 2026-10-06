import { z } from 'zod';
import { AnchorSchema } from '@/anchoring/types';
import { FragmentTypeSchema, ProviderIdSchema } from '@/settings/schema';

export const MAX_THREAD_DEPTH = 3;

export const ThreadSchema = z.object({
  id: z.string(),
  site: z.string(),
  conversationId: z.string(),
  anchor: AnchorSchema,
  fragmentType: FragmentTypeSchema,
  fragmentMarkdown: z.string(),
  /** Snapshot of the message containing the fragment, so the thread keeps working if the page changes. */
  sourceMarkdown: z.string(),
  userPromptMarkdown: z.string().nullable(),
  title: z.string(),
  parentThreadId: z.string().optional(),
  depth: z.number().int().min(1).max(MAX_THREAD_DEPTH),
  provider: ProviderIdSchema,
  model: z.string(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  createdAt: z.number(),
  updatedAt: z.number(),
  status: z.enum(['active', 'orphaned']),
});
export type Thread = z.infer<typeof ThreadSchema>;

export const ThreadMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.number(),
});
export type ThreadMessage = z.infer<typeof ThreadMessageSchema>;

export function makeTitle(markdown: string): string {
  const firstLine = markdown
    .replace(/^```.*$/m, '')
    .split('\n')
    // Strip Markdown markers (headings, quotes, list bullets, emphasis, table pipes) but keep code intact.
    .map((line) => line.replace(/^\s*(?:#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|\|)+/, '').replace(/[*_`$|]+/g, ' ').replace(/\s+/g, ' ').trim())
    .find((line) => line.length > 0);
  const title = firstLine ?? 'Untitled dive';
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}
