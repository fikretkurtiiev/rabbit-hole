import type { ChatMessage } from '@/providers/types';
import type { FragmentType } from '@/settings/schema';

export const INTRO_REQUEST = 'Explain this fragment.';

export interface ParentContext {
  fragmentType: FragmentType;
  fragmentMarkdown: string;
  intro: string;
}

export interface ContextPacketInput {
  fragmentType: FragmentType;
  fragmentMarkdown: string;
  /** Full assistant message (or popover answer for nested dives) containing the fragment. */
  sourceMessageMarkdown: string;
  /** The user message that prompted the source message, when known. */
  userPromptMarkdown: string | null;
  /** Thread history after the intro request, oldest first. */
  history: ChatMessage[];
  /** For nested threads: the parent thread's fragment and intro (never the whole parent thread). */
  parents: ParentContext[];
  introLength: 'short' | 'medium';
  contextBudgetTokens: number;
}

export interface ContextPacket {
  system: string;
  messages: ChatMessage[];
}

/** Rough token estimate (~4 chars per token) – good enough for budgeting, no tokenizer needed. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const ELLIPSIS = '\n[…]\n';

/** Truncates `text` to `maxChars`, keeping a window centred on `focus` rather than cutting from the start. */
export function truncateAround(text: string, focus: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 0) return '';
  const focusIndex = focus ? text.indexOf(focus.slice(0, 200)) : -1;
  if (focusIndex === -1) {
    return text.slice(0, maxChars) + ELLIPSIS;
  }
  const focusLength = Math.min(focus.length, maxChars);
  const room = maxChars - focusLength;
  let start = Math.max(0, focusIndex - Math.floor(room / 2));
  let end = start + maxChars;
  if (end > text.length) {
    end = text.length;
    start = Math.max(0, end - maxChars);
  }
  return (start > 0 ? ELLIPSIS : '') + text.slice(start, end) + (end < text.length ? ELLIPSIS : '');
}

function introInstruction(length: 'short' | 'medium'): string {
  return length === 'short' ? '3–4 sentences' : '5–6 sentences';
}

export function buildContextPacket(input: ContextPacketInput): ContextPacket {
  const budgetChars = input.contextBudgetTokens * 4;
  const userBudget = input.userPromptMarkdown ? Math.floor(budgetChars * 0.25) : 0;
  const userPrompt = input.userPromptMarkdown ? truncateAround(input.userPromptMarkdown, '', userBudget) : null;
  const sourceBudget = budgetChars - (userPrompt?.length ?? 0);
  const source = truncateAround(input.sourceMessageMarkdown, input.fragmentMarkdown, sourceBudget);

  const sections = [
    'You are Rabbit Hole, a side-thread assistant inside a browser extension. The user is reading an AI chat ' +
      'and has selected a fragment of an answer to explore separately, without affecting the main conversation.',
    '',
    `Your first reply must be a short, encyclopedia-style explanation of the fragment (${introInstruction(input.introLength)}), ` +
      'written like the opening of a Wikipedia article: define it, say what it does or means in the context of the ' +
      'surrounding answer, and mention one notable detail. No preamble, no headings, no follow-up questions. ' +
      'After that first reply, continue as a normal, concise conversational assistant focused on the fragment.',
    '',
    'Use Markdown. Use LaTeX with $…$ / $$…$$ for math.',
  ];

  if (userPrompt) {
    sections.push('', '<user_question_that_prompted_the_answer>', userPrompt, '</user_question_that_prompted_the_answer>');
  }
  sections.push('', '<answer_containing_the_fragment>', source, '</answer_containing_the_fragment>');

  input.parents.forEach((parent, index) => {
    sections.push(
      '',
      `<parent_dive level="${index + 1}" type="${parent.fragmentType}">`,
      '<fragment>',
      parent.fragmentMarkdown,
      '</fragment>',
      '<explanation>',
      parent.intro,
      '</explanation>',
      '</parent_dive>',
    );
  });

  sections.push('', `<fragment type="${input.fragmentType}">`, input.fragmentMarkdown, '</fragment>');

  return {
    system: sections.join('\n'),
    messages: [{ role: 'user', content: INTRO_REQUEST }, ...input.history],
  };
}
