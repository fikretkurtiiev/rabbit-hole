import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const components: Components = {
  // Links open in a new tab and never navigate the host page.
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  // No remote images: they could leak data to third parties.
  img: ({ alt }) => <span>{alt ? `[image: ${alt}]` : '[image]'}</span>,
};

interface MarkdownProps {
  content: string;
}

/**
 * Renders AI output. react-markdown escapes raw HTML by default (no rehype-raw), so nothing from the
 * model is ever injected as HTML.
 */
export const Markdown = memo(function Markdown({ content }: MarkdownProps) {
  return (
    <div className="rh-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }], [rehypeHighlight, { detect: false }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
