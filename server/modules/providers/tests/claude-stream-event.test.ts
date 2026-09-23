import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapCliOptionsToSDK,
  resolvePartialStreamEvent,
} from '@/modules/providers/list/claude/claude-runtime.provider.js';
import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';

const sessions = new ClaudeSessionsProvider();

test('mapCliOptionsToSDK turns on includePartialMessages', () => {
  const sdkOptions = mapCliOptionsToSDK({});
  assert.equal(sdkOptions.includePartialMessages, true);
});

test('a main-thread stream_event unwraps into the event the normalizer maps to stream_delta', () => {
  const sdkMessage = {
    type: 'stream_event',
    session_id: 'sess-1',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hola' } },
  };

  const event = resolvePartialStreamEvent(sdkMessage);
  assert.ok(event);

  const [normalized] = sessions.normalizeMessage(event, 'sess-1');
  assert.equal(normalized.kind, 'stream_delta');
  assert.equal(normalized.content, 'Hola');
});

test('a main-thread content_block_stop unwraps into the event the normalizer maps to stream_end', () => {
  const sdkMessage = {
    type: 'stream_event',
    session_id: 'sess-1',
    event: { type: 'content_block_stop' },
  };

  const event = resolvePartialStreamEvent(sdkMessage);
  assert.ok(event);

  const [normalized] = sessions.normalizeMessage(event, 'sess-1');
  assert.equal(normalized.kind, 'stream_end');
});

test('a subagent stream_event (parent_tool_use_id set) is dropped, not passed to the normalizer', () => {
  const sdkMessage = {
    type: 'stream_event',
    session_id: 'sess-1',
    parent_tool_use_id: 'toolu_agent_1',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hola' } },
  };

  assert.equal(resolvePartialStreamEvent(sdkMessage), null);
});

test('a non stream_event message is left for the normal branch, not unwrapped', () => {
  assert.equal(resolvePartialStreamEvent({ type: 'assistant' }), null);
  assert.equal(resolvePartialStreamEvent(null), null);
});

test('a stream_event with no event payload unwraps to null', () => {
  assert.equal(resolvePartialStreamEvent({ type: 'stream_event', session_id: 'sess-1' }), null);
});
