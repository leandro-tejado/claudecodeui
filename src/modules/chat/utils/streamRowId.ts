/**
 * The stable identity a streaming row — and the final message that closes
 * it — are keyed by.
 *
 * Claude's `(messageId, blockIndex)` pair is shared by every delta of one
 * content block and by the final `text`/`thinking` row that replaces it on
 * the transcript: the same pair from `message_start` through
 * `content_block_stop` to the persisted JSONL row (see
 * `docs/architecture/protocolo-streaming.md`). Keying the row by that pair —
 * and overriding the final message's own id to match — turns "the full
 * reply replaces its streamed fragments" into a plain same-id upsert, with
 * no text-matching involved.
 *
 * Other providers (Cursor, OpenCode, Codex) never report `messageId`, so
 * they keep the one-row-per-session fallback: `__streaming_<sessionId>`,
 * replaced in place on every flush and renamed once when the block closes
 * with no identity to carry forward.
 */
export function streamRowId(sessionId: string, messageId?: string, blockIndex?: number): string {
  return messageId && typeof blockIndex === 'number'
    ? `stream:${messageId}:${blockIndex}`
    : `__streaming_${sessionId}`;
}

/**
 * The tmux pane reader's draft (Fase 7, paso 8: `tmux-pane-vivo.service.ts`)
 * carries a synthetic `messageId` of this shape instead of a real Claude
 * block identity — there is no `message_start` to take one from, since the
 * draft is reread off the pane's screen, not off the SDK stream. The real
 * answer lands separately, under the transcript's own `uuid`/`messageId`,
 * which never collides with this one.
 */
export const TMUX_BORRADOR_PREFIX = 'tmux-borrador:';

/** Whether a stream identity's `messageId` is the tmux draft's synthetic one, not a real Claude block identity. */
export function esIdentidadBorradorTmux(messageId?: string): boolean {
  return typeof messageId === 'string' && messageId.startsWith(TMUX_BORRADOR_PREFIX);
}
