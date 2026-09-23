import { useMemo } from 'react';

import { MarkdownBody } from '@/modules/chat/transcript/Markdown';
import { splitStreamingMarkdown } from '@/modules/chat/utils/streamingMarkdown';
import { useRevelado } from '@/modules/chat/utils/revelado';

type StreamingMarkdownProps = {
  content: string;
  /** False once the reply is complete, which stops the splitting. */
  isStreaming: boolean;
  className?: string;
  /**
   * Paces `content` in through the typewriter reveal instead of showing every
   * character the instant it lands, and shows a blinking cursor while it is
   * still catching up. Off by default — history and the finished reply have
   * nothing to reveal — so only a message just arrived live (`isStreaming` in
   * the SDK chat, or a tmux reply flagged `isLiveText`) turns it on.
   */
  revelar?: boolean;
  /**
   * Only meaningful while `revelar` is on: true starts the reveal at 0 (a
   * tmux reply, which lands as one complete block with nothing shown yet);
   * false starts already caught up to `content` at mount and only animates
   * growth after that (the SDK placeholder, which already holds real
   * accumulated text the first time it renders). Defaults to true, matching
   * `useRevelado`.
   */
  arrancarVacio?: boolean;
};

/**
 * Used by chat's MessageComponent for an assistant reply, streaming or not.
 *
 * The realtime handler republishes the whole accumulated reply every 100ms, so
 * a single <Markdown> would re-parse the entire message ten times a second.
 * Splitting at a block boundary keeps the settled half's props stable, so
 * memo(MarkdownBody) skips it and only the block still being written is
 * re-parsed. Markdown blocks are independent across the boundaries
 * splitStreamingMarkdown chooses, so the rendered output matches the unsplit
 * document — including block spacing, because both halves are siblings inside
 * the single prose container below.
 *
 * It renders the finished reply too, with isStreaming false and no split at all
 * — there is nothing left to grow, so a second parse buys nothing. The reason it
 * handles that case rather than deferring to <Markdown> is that MessageComponent
 * used to switch between the two at that position, and React treats a different
 * element type in the same position as a different component: every completed
 * reply threw away its DOM and rebuilt it, losing any selection the user had
 * started making inside it. One component there means the nodes are reconciled.
 * messageStreamEnd.test.tsx pins that.
 *
 * A block changes parent when it crosses from pending to settled, so its DOM is
 * recreated at that moment, dropping transient in-block state (a code block's
 * "Copied" tick, a text selection).
 *
 * That crossing is not one-way. The boundary is recomputed from scratch on each
 * tick, so an already-settled block returns to pending whenever the text that
 * follows it makes the old boundary unsafe to split at — a soft-wrapped line, or
 * a list, table or blockquote starting after it. Retracting is what keeps the
 * two halves rendering identically to the unsplit document, so it is correct,
 * not a bug; measured on realistic replies at streaming speed it happens for
 * about a third of them, once. Only blocks in a message still being streamed are
 * affected.
 */
export default function StreamingMarkdown({
  content,
  isStreaming,
  className,
  revelar = false,
  arrancarVacio = true,
}: StreamingMarkdownProps) {
  const revelado = useRevelado(content, revelar, arrancarVacio);
  const visible = revelar ? revelado : content;
  const revelando = revelar && visible.length < content.length;

  const { settled, pending } = useMemo(
    () => (isStreaming ? splitStreamingMarkdown(visible) : { settled: visible, pending: '' }),
    [visible, isStreaming],
  );

  return (
    <div className={className}>
      {settled && <MarkdownBody>{settled}</MarkdownBody>}
      {pending && <MarkdownBody>{pending}</MarkdownBody>}
      {revelando && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-current align-text-bottom"
        />
      )}
    </div>
  );
}
