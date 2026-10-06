import type { LLMProvider } from '@/shared/types';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * Text streamed so far for one session's open block (text or thinking),
 * flushed into the store's streaming row at most every `STREAM_FLUSH_MS`.
 *
 * One buffer per session, not one for the whole pane: with a single shared
 * buffer, two sessions streaming at once mixed their deltas, a view switch
 * wiped the text a background session was still writing, and the branch
 * that covered sessions out of view stored every delta as its own message
 * — the reply then read as a column of fragments, each with its own "MD"
 * button, followed by the full text once it arrived (30-sep).
 *
 * Only one block streams at a time per session's main thread (subagent
 * partials are dropped before they reach here), so the buffer carries that
 * block's own identity — `messageId`/`blockIndex`, when the provider reports
 * one — alongside its text.
 */
export type StreamBuffer = {
  text: string;
  timer: ReturnType<typeof setTimeout> | null;
  provider: LLMProvider;
  kind: 'stream_delta' | 'thinking_delta';
  /** Claude's identity for this open block (see `streamRowId.ts`); absent for other providers. */
  messageId?: string;
  blockIndex?: number;
  /**
   * Set once the block's full message arrived. The streamed rows are gone by
   * then, so whatever deltas still follow for that same block are swallowed
   * instead of growing a row of their own next to the full message.
   */
  settledBy?: string;
};

export type StreamBuffers = Map<string, StreamBuffer>;

type StreamingStore = Pick<SessionStore, 'updateStreaming' | 'finalizeStreaming' | 'discardStreaming'>;

export const STREAM_FLUSH_MS = 100;

function appendDelta(
  buffers: StreamBuffers,
  sessionId: string,
  kind: 'stream_delta' | 'thinking_delta',
  text: string,
  provider: LLMProvider,
  messageId: string | undefined,
  blockIndex: number | undefined,
  store: StreamingStore,
): void {
  let buffer = buffers.get(sessionId);
  if (!buffer) {
    buffer = { text: '', timer: null, provider, kind, messageId, blockIndex };
    buffers.set(sessionId, buffer);
  }
  if (buffer.settledBy !== undefined) {
    const continued = buffer.text + text;
    if (buffer.settledBy.startsWith(continued)) {
      buffer.text = continued;
      return;
    }
    // Not the tail of the settled block: a new block starts here.
    buffer = { text: '', timer: null, provider, kind, messageId, blockIndex };
    buffers.set(sessionId, buffer);
  }
  buffer.text += text;
  if (!buffer.timer) {
    const scheduled = buffer;
    scheduled.timer = setTimeout(() => {
      scheduled.timer = null;
      if (buffers.get(sessionId) === scheduled && scheduled.text) {
        store.updateStreaming(sessionId, scheduled.text, scheduled.provider, {
          kind: scheduled.kind,
          messageId: scheduled.messageId,
          blockIndex: scheduled.blockIndex,
        });
      }
    }, STREAM_FLUSH_MS);
  }
}

export function appendStreamDelta(
  buffers: StreamBuffers,
  sessionId: string,
  text: string,
  provider: LLMProvider,
  messageId: string | undefined,
  blockIndex: number | undefined,
  store: StreamingStore,
): void {
  appendDelta(buffers, sessionId, 'stream_delta', text, provider, messageId, blockIndex, store);
}

/** Same as `appendStreamDelta`, for a `thinking_delta` block (Claude's extended-thinking text). */
export function appendThinkingDelta(
  buffers: StreamBuffers,
  sessionId: string,
  text: string,
  provider: LLMProvider,
  messageId: string | undefined,
  blockIndex: number | undefined,
  store: StreamingStore,
): void {
  appendDelta(buffers, sessionId, 'thinking_delta', text, provider, messageId, blockIndex, store);
}

/**
 * Sets (never concatenates) a session's open block to `text` — the tmux pane
 * reader's draft (Fase 7, paso 8: `tmux-pane-vivo.service.ts`) rereads the
 * whole visible answer off the pane every ~400ms and sends the accumulated
 * text whole each time, unlike a provider's own incremental deltas, so there
 * is nothing here to append to; appending would double it on every tick.
 */
export function setStreamDraft(
  buffers: StreamBuffers,
  sessionId: string,
  text: string,
  provider: LLMProvider,
  messageId: string,
  blockIndex: number,
  store: StreamingStore,
): void {
  let buffer = buffers.get(sessionId);
  if (!buffer || buffer.messageId !== messageId || buffer.blockIndex !== blockIndex) {
    buffer = { text: '', timer: null, provider, kind: 'stream_delta', messageId, blockIndex };
    buffers.set(sessionId, buffer);
  }
  buffer.text = text;
  if (!buffer.timer) {
    const scheduled = buffer;
    scheduled.timer = setTimeout(() => {
      scheduled.timer = null;
      if (buffers.get(sessionId) === scheduled) {
        store.updateStreaming(sessionId, scheduled.text, scheduled.provider, {
          kind: scheduled.kind,
          messageId: scheduled.messageId,
          blockIndex: scheduled.blockIndex,
        });
      }
    }, STREAM_FLUSH_MS);
  }
}

/**
 * Drops a session's open draft without turning it into a persisted message —
 * `stream_reemplazo` (Fase 7, paso 8) means the real JSONL row is already on
 * its way in as an ordinary message, under its own transcript `uuid`, never
 * the draft's synthetic `tmux-borrador:<sessionId>` id; `finalizeStreamBuffer`
 * would either wait forever for a replacement that is never coming on this id,
 * or (without an identity) mint a stray duplicate row next to the real one.
 */
export function discardStreamDraft(buffers: StreamBuffers, sessionId: string, store: StreamingStore): void {
  const buffer = buffers.get(sessionId);
  if (!buffer) return;
  if (buffer.timer) {
    clearTimeout(buffer.timer);
  }
  buffers.delete(sessionId);
  if (buffer.messageId && typeof buffer.blockIndex === 'number') {
    store.discardStreaming(sessionId, { messageId: buffer.messageId, blockIndex: buffer.blockIndex });
  }
}

/** Writes whatever is still pending into the streaming row, keeping the block open. */
export function flushStreamBuffer(buffers: StreamBuffers, sessionId: string, store: StreamingStore): void {
  const buffer = buffers.get(sessionId);
  if (!buffer) return;
  if (buffer.timer) {
    clearTimeout(buffer.timer);
    buffer.timer = null;
  }
  if (buffer.text && buffer.settledBy === undefined) {
    store.updateStreaming(sessionId, buffer.text, buffer.provider, {
      kind: buffer.kind,
      messageId: buffer.messageId,
      blockIndex: buffer.blockIndex,
    });
  }
}

/**
 * The block's full message is here: its streamed rows are redundant (the
 * store retires them when it appends the message), so nothing pending is
 * written. The buffer stays until `stream_end` to absorb deltas that trail
 * the message.
 */
export function settleStreamBuffer(buffers: StreamBuffers, sessionId: string, fullText: string): void {
  const buffer = buffers.get(sessionId);
  if (!buffer) return;
  if (buffer.timer) {
    clearTimeout(buffer.timer);
    buffer.timer = null;
  }
  buffer.settledBy = fullText;
}

/**
 * Closes the session's open block: the streaming row becomes a regular
 * assistant message (no identity) or is left for the final `text`/`thinking`
 * message to replace in place (identity present) — either way the next
 * delta starts a fresh buffer.
 */
export function finalizeStreamBuffer(buffers: StreamBuffers, sessionId: string, store: StreamingStore): void {
  const buffer = buffers.get(sessionId);
  flushStreamBuffer(buffers, sessionId, store);
  buffers.delete(sessionId);
  // No-op when the session has no streaming row.
  store.finalizeStreaming(sessionId, buffer ? { messageId: buffer.messageId, blockIndex: buffer.blockIndex } : undefined);
}

export function flushAllStreamBuffers(buffers: StreamBuffers, store: StreamingStore): void {
  for (const sessionId of buffers.keys()) {
    flushStreamBuffer(buffers, sessionId, store);
  }
}
