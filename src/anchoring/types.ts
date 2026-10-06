import { z } from 'zod';
import { BlockTypeSchema } from '@/settings/schema';

export const TextQuoteSchema = z.object({
  exact: z.string(),
  prefix: z.string(),
  suffix: z.string(),
});
export type TextQuote = z.infer<typeof TextQuoteSchema>;

export const SelectionAnchorSchema = z.object({
  kind: z.literal('selection'),
  messageIndex: z.number().int(),
  quote: TextQuoteSchema,
});
export type SelectionAnchor = z.infer<typeof SelectionAnchorSchema>;

export const BlockAnchorSchema = z.object({
  kind: z.literal('block'),
  messageIndex: z.number().int(),
  blockType: BlockTypeSchema,
  ordinal: z.number().int(),
  contentHash: z.string(),
  firstLine: z.string(),
});
export type BlockAnchor = z.infer<typeof BlockAnchorSchema>;

/** Anchor inside a Rabbit Hole popover answer (nested dives). */
export const ThreadMessageAnchorSchema = z.object({
  kind: z.literal('thread-message'),
  messageId: z.string(),
  quote: TextQuoteSchema,
});
export type ThreadMessageAnchor = z.infer<typeof ThreadMessageAnchorSchema>;

export const AnchorSchema = z.discriminatedUnion('kind', [
  SelectionAnchorSchema,
  BlockAnchorSchema,
  ThreadMessageAnchorSchema,
]);
export type Anchor = z.infer<typeof AnchorSchema>;
