import type { LLMProvider } from '@/shared/types';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * Text streamed so far for one session's open text block, flushed into the
 * store's single `__streaming_<sid>` row at most every `STREAM_FLUSH_MS`.
 *
 * One buffer per session, not one for the whole pane: with a single shared
 * buffer, two sessions streaming at once mixed their deltas, a view switch
 * wiped the text a background session was still writing, and the branch
 * that covered sessions out of view stored every delta as its own message
 * — the reply then read as a column of fragments, each with its own "MD"
 * button, followed by the full text once it arrived (30-sep).
 */
export type StreamBuffer = {
  text: string;
  timer: ReturnType<typeof setTimeout> | null;
  provider: LLMProvider;
  /**
   * Set once the block's full message arrived. The streamed rows are gone by
   * then, so whatever deltas still follow for that same block are swallowed
   * instead of growing a row of their own next to the full message.
   */
  settledBy?: string;
};

export type StreamBuffers = Map<string, StreamBuffer>;

type StreamingStore = Pick<SessionStore, 'updateStreaming' | 'finalizeStreaming'>;

export const STREAM_FLUSH_MS = 100;

export function appendStreamDelta(
  buffers: StreamBuffers,
  sessionId: string,
  text: string,
  provider: LLMProvider,
  store: StreamingStore,
): void {
  let buffer = buffers.get(sessionId);
  if (!buffer) {
    buffer = { text: '', timer: null, provider };
    buffers.set(sessionId, buffer);
  }
  if (buffer.settledBy !== undefined) {
    const continued = buffer.text + text;
    if (buffer.settledBy.startsWith(continued)) {
      buffer.text = continued;
      return;
    }
    // Not the tail of the settled block: a new block starts here.
    buffer = { text: '', timer: null, provider };
    buffers.set(sessionId, buffer);
  }
  buffer.text += text;
  if (!buffer.timer) {
    const scheduled = buffer;
    scheduled.timer = setTimeout(() => {
      scheduled.timer = null;
      if (buffers.get(sessionId) === scheduled && scheduled.text) {
        store.updateStreaming(sessionId, scheduled.text, scheduled.provider);
      }
    }, STREAM_FLUSH_MS);
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
    store.updateStreaming(sessionId, buffer.text, buffer.provider);
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
 * Closes the session's text block: the streaming row becomes a regular
 * assistant message and the next delta starts a new one.
 */
export function finalizeStreamBuffer(buffers: StreamBuffers, sessionId: string, store: StreamingStore): void {
  flushStreamBuffer(buffers, sessionId, store);
  buffers.delete(sessionId);
  // No-op when the session has no streaming row.
  store.finalizeStreaming(sessionId);
}

export function flushAllStreamBuffers(buffers: StreamBuffers, store: StreamingStore): void {
  for (const sessionId of buffers.keys()) {
    flushStreamBuffer(buffers, sessionId, store);
  }
}
