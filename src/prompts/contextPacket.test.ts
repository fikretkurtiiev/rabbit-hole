import { INTRO_REQUEST, buildContextPacket, truncateAround, type ContextPacketInput } from './contextPacket';

const base: ContextPacketInput = {
  fragmentType: 'code',
  fragmentMarkdown: '```js\nfoo()\n```',
  sourceMessageMarkdown: 'Intro text.\n\n```js\nfoo()\n```\n\nOutro.',
  userPromptMarkdown: 'How do I call foo?',
  history: [],
  parents: [],
  introLength: 'short',
  contextBudgetTokens: 6000,
};

describe('truncateAround', () => {
  it('returns short text untouched', () => {
    expect(truncateAround('hello', 'ell', 100)).toBe('hello');
  });

  it('keeps the focus visible when truncating', () => {
    const text = `${'a'.repeat(1000)}FOCUS${'b'.repeat(1000)}`;
    const result = truncateAround(text, 'FOCUS', 100);
    expect(result).toContain('FOCUS');
    expect(result.startsWith('\n[…]')).toBe(true);
    expect(result.endsWith('[…]\n')).toBe(true);
  });

  it('keeps the focus near the end of the text', () => {
    const text = `${'a'.repeat(1000)}END`;
    expect(truncateAround(text, 'END', 50)).toMatch(/END$/);
  });

  it('falls back to the start when the focus is missing', () => {
    expect(truncateAround('x'.repeat(100), 'nope', 10)).toBe(`${'x'.repeat(10)}\n[…]\n`);
  });
});

describe('buildContextPacket', () => {
  it('includes fragment, source answer and user prompt, and starts with the intro request', () => {
    const packet = buildContextPacket(base);
    expect(packet.system).toContain('<fragment type="code">');
    expect(packet.system).toContain('How do I call foo?');
    expect(packet.system).toContain('Outro.');
    expect(packet.system).toContain('3–4 sentences');
    expect(packet.messages).toEqual([{ role: 'user', content: INTRO_REQUEST }]);
  });

  it('appends history after the intro request', () => {
    const packet = buildContextPacket({
      ...base,
      history: [
        { role: 'assistant', content: 'intro' },
        { role: 'user', content: 'more?' },
      ],
    });
    expect(packet.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('respects the budget while keeping the fragment', () => {
    const longSource = `${'x'.repeat(50_000)}\n\n\`\`\`js\nfoo()\n\`\`\`\n\n${'y'.repeat(50_000)}`;
    const packet = buildContextPacket({ ...base, sourceMessageMarkdown: longSource, contextBudgetTokens: 1000 });
    expect(packet.system.length).toBeLessThan(6000);
    expect(packet.system.match(/foo\(\)/g)?.length).toBe(2);
  });

  it('includes parent fragments and intros for nested dives', () => {
    const packet = buildContextPacket({
      ...base,
      parents: [{ fragmentType: 'paragraph', fragmentMarkdown: 'parent frag', intro: 'parent intro' }],
    });
    expect(packet.system).toContain('parent frag');
    expect(packet.system).toContain('parent intro');
  });
});
