import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapCliOptionsToSDK,
  modelSupportsAdaptiveThinking,
  resolvePartialStreamEvent,
} from '@/modules/providers/list/claude/claude-runtime.provider.js';
import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';

const sessions = new ClaudeSessionsProvider();

test('mapCliOptionsToSDK turns on includePartialMessages', () => {
  const sdkOptions = mapCliOptionsToSDK({});
  assert.equal(sdkOptions.includePartialMessages, true);
});

test('mapCliOptionsToSDK asks for adaptive, summarized thinking on a model that supports it', () => {
  const sdkOptions = mapCliOptionsToSDK({});
  assert.deepEqual(sdkOptions.thinking, { type: 'adaptive', display: 'summarized' });
});

test('mapCliOptionsToSDK does not ask for thinking on haiku', () => {
  const sdkOptions = mapCliOptionsToSDK({ model: 'haiku' });
  assert.equal(sdkOptions.thinking, undefined);
});

test('modelSupportsAdaptiveThinking excludes haiku and defaults everything else to true', () => {
  assert.equal(modelSupportsAdaptiveThinking('claude-haiku-5'), false);
  assert.equal(modelSupportsAdaptiveThinking('haiku'), false);
  assert.equal(modelSupportsAdaptiveThinking('claude-sonnet-5'), true);
  assert.equal(modelSupportsAdaptiveThinking(undefined), true);
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

test('a subagent content_block_delta (parent_tool_use_id set) is dropped, not passed to the normalizer', () => {
  const sdkMessage = {
    type: 'stream_event',
    session_id: 'sess-1',
    parent_tool_use_id: 'toolu_agent_1',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hola' } },
  };

  assert.equal(resolvePartialStreamEvent(sdkMessage), null);
});

test('a subagent content_block_stop (parent_tool_use_id set) is dropped too', () => {
  const sdkMessage = {
    type: 'stream_event',
    session_id: 'sess-1',
    parent_tool_use_id: 'toolu_agent_1',
    event: { type: 'content_block_stop', index: 0 },
  };

  assert.equal(resolvePartialStreamEvent(sdkMessage), null);
});

test('a subagent content_block_start (parent_tool_use_id set) is let through — it becomes the Agent card\'s activity', () => {
  const sdkMessage = {
    type: 'stream_event',
    session_id: 'sess-1',
    parent_tool_use_id: 'toolu_agent_1',
    event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} } },
  };

  const event = resolvePartialStreamEvent(sdkMessage);
  assert.ok(event);
  const [activity] = sessions.normalizeMessage(event, 'sess-1');
  assert.equal(activity.kind, 'activity');
  assert.equal(activity.activityKind, 'tool');
});

test('a message_start captures the API message id, and content_block_delta stamps it plus blockIndex onto stream_delta', () => {
  const localSessions = new ClaudeSessionsProvider();
  const started = localSessions.normalizeMessage({ type: 'message_start', message: { id: 'msg_abc123' } }, 'sess-msg-id');
  assert.deepEqual(started, []);

  const [delta] = localSessions.normalizeMessage(
    { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Hola' } },
    'sess-msg-id',
  );
  assert.equal(delta.kind, 'stream_delta');
  assert.equal(delta.content, 'Hola');
  assert.equal(delta.messageId, 'msg_abc123');
  assert.equal(delta.blockIndex, 2);

  const [end] = localSessions.normalizeMessage({ type: 'content_block_stop', index: 2 }, 'sess-msg-id');
  assert.equal(end.kind, 'stream_end');
  assert.equal(end.messageId, 'msg_abc123');
  assert.equal(end.blockIndex, 2);
});

test('a thinking_delta carries the same identity pair as a text stream_delta', () => {
  const localSessions = new ClaudeSessionsProvider();
  localSessions.normalizeMessage({ type: 'message_start', message: { id: 'msg_think1' } }, 'sess-thinking');

  const [thinking] = localSessions.normalizeMessage(
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Pensando...' } },
    'sess-thinking',
  );
  assert.equal(thinking.kind, 'thinking_delta');
  assert.equal(thinking.content, 'Pensando...');
  assert.equal(thinking.messageId, 'msg_think1');
  assert.equal(thinking.blockIndex, 0);
});

test('content_block_start raises an activity for a thinking block, naming nothing', () => {
  const localSessions = new ClaudeSessionsProvider();
  localSessions.normalizeMessage({ type: 'message_start', message: { id: 'msg_act1' } }, 'sess-activity');

  const [activity] = localSessions.normalizeMessage(
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
    'sess-activity',
  );
  assert.equal(activity.kind, 'activity');
  assert.equal(activity.activityKind, 'thinking');
  assert.equal(activity.toolName, undefined);
  assert.equal(activity.messageId, 'msg_act1');
  assert.equal(activity.blockIndex, 0);
});

test('content_block_start raises an activity naming the tool for a tool_use block', () => {
  const localSessions = new ClaudeSessionsProvider();
  const [activity] = localSessions.normalizeMessage(
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} } },
    'sess-activity-tool',
  );
  assert.equal(activity.kind, 'activity');
  assert.equal(activity.activityKind, 'tool');
  assert.equal(activity.toolName, 'Bash');
  assert.equal(activity.blockIndex, 1);
});

test('content_block_start raises no activity for a plain text block', () => {
  const localSessions = new ClaudeSessionsProvider();
  const normalized = localSessions.normalizeMessage(
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    'sess-activity-text',
  );
  assert.deepEqual(normalized, []);
});

test('message_stop clears the captured message id — a later delta with no message_start in between carries none', () => {
  const localSessions = new ClaudeSessionsProvider();
  localSessions.normalizeMessage({ type: 'message_start', message: { id: 'msg_will_clear' } }, 'sess-clear');
  assert.deepEqual(localSessions.normalizeMessage({ type: 'message_stop' }, 'sess-clear'), []);

  const [delta] = localSessions.normalizeMessage(
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } },
    'sess-clear',
  );
  assert.equal(delta.messageId, undefined);
});

test('the final complete assistant text and thinking rows carry the same messageId + blockIndex as their deltas', () => {
  const localSessions = new ClaudeSessionsProvider();
  const [thinking, text] = localSessions.normalizeMessage({
    uuid: 'row-uuid-1',
    message: {
      role: 'assistant',
      id: 'msg_final1',
      content: [
        { type: 'thinking', thinking: 'Pensando...' },
        { type: 'text', text: 'Hola' },
      ],
    },
  }, 'sess-final');

  assert.equal(thinking.kind, 'thinking');
  assert.equal(thinking.messageId, 'msg_final1');
  assert.equal(thinking.blockIndex, 0);

  assert.equal(text.kind, 'text');
  assert.equal(text.messageId, 'msg_final1');
  assert.equal(text.blockIndex, 1);
});

test('a non stream_event message is left for the normal branch, not unwrapped', () => {
  assert.equal(resolvePartialStreamEvent({ type: 'assistant' }), null);
  assert.equal(resolvePartialStreamEvent(null), null);
});

test('a stream_event with no event payload unwraps to null', () => {
  assert.equal(resolvePartialStreamEvent({ type: 'stream_event', session_id: 'sess-1' }), null);
});
