import { useMemo } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import MarkdownCodeBlock from '@/modules/code-editor/markdown/MarkdownCodeBlock';
import { useMathPlugins } from '@/shared/useMathPlugins';

type MarkdownPreviewProps = {
  content: string;
};

const markdownPreviewComponents: Components = {
  code: MarkdownCodeBlock,
  // MarkdownCodeBlock renders its own highlighted <pre>; passthrough prevents a
  // second Typography-styled <pre> shell from framing it.
  pre: ({ children }) => <>{children}</>,
  // Mismo trazo que el markdown del chat (`chat/transcript/Markdown.tsx`): la
  // cita lleva el acento de marca y las tablas, la tarjeta de borde suave.
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-ds-primary pl-4 not-italic text-ds-ink [quotes:none]">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-ds-primary hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-ds-md border border-ds-line">
      <table className="my-0 min-w-full border-collapse text-ds-compact">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ds-surface-2">{children}</thead>,
  tr: ({ children }) => <tr className="[&:last-child>td]:border-b-0">{children}</tr>,
  th: ({ children }) => (
    <th className="border-b border-ds-line px-2 py-1 text-left font-semibold text-ds-ink">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-ds-line px-2 py-1 align-top text-ds-ink">{children}</td>,
};

/** Used by the prd-editor module, and by CodeEditorSurface inside code-editor, to render markdown source as formatted preview output. */
export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  // Always enabled here: a PRD preview is opened deliberately, so the wait for
  // KaTeX is paid by someone who asked for the document, not by every visitor.
  const math = useMathPlugins(true);
  const remarkPlugins = useMemo(
    () => (math ? [remarkGfm, [math.remarkMath, { singleDollarTextMath: false }]] : [remarkGfm]) as any,
    [math],
  );
  const rehypePlugins = useMemo(() => (math ? [math.rehypeKatex] : []), [math]);

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={markdownPreviewComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
