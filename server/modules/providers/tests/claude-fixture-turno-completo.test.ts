import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolvePartialStreamEvent } from '@/modules/providers/list/claude/claude-runtime.provider.js';
import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';
import type { NormalizedMessage } from '@/shared/types.js';

/**
 * Replays `e2e/fixtures/turnos/completo.jsonl` — one raw SDK message per
 * line, synthetic (see its first line) because this environment has no
 * `CLAUDE_CODE_OAUTH_TOKEN` to record a real turn — through the same two
 * functions `claude-runtime.provider.js`'s live loop calls: unwrap, then
 * normalize. This is the fixture's whole job (plan Fase 4, paso 1): a single
 * place that pins the normalizer's behavior against one coherent turn
 * (thinking, text, a plain tool, and a subagent) instead of only against
 * hand-written one-event cases.
 */
function loadFixtureLines(): Array<Record<string, unknown>> {
  const fixturePath = path.join(process.cwd(), 'e2e/fixtures/turnos/completo.jsonl');
  return readFileSync(fixturePath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Mirrors the relevant slice of the for-await loop in `queryClaudeSDK`. */
function replay(sdkMessages: Array<Record<string, unknown>>, sessionId: string): NormalizedMessage[] {
  const sessions = new ClaudeSessionsProvider();
  const out: NormalizedMessage[] = [];

  for (const sdkMessage of sdkMessages) {
    const parentToolUseId = typeof sdkMessage.parent_tool_use_id === 'string' ? sdkMessage.parent_tool_use_id : undefined;
    let normalized: NormalizedMessage[];
    if (sdkMessage.type === 'stream_event') {
      const partialEvent = resolvePartialStreamEvent(sdkMessage);
      normalized = partialEvent ? sessions.normalizeMessage(partialEvent, sessionId) : [];
    } else {
      normalized = sessions.normalizeMessage(sdkMessage, sessionId);
    }
    for (const msg of normalized) {
      if (parentToolUseId && !msg.parentToolUseId) {
        msg.parentToolUseId = parentToolUseId;
        if (msg.kind === 'activity') {
          delete msg.messageId;
        }
      }
      out.push(msg);
    }
  }
  return out;
}

test('the fixture is marked synthetic on its first line', () => {
  const [marker] = loadFixtureLines();
  assert.equal(marker._origen, 'sintetico');
});

test('replaying the fixture produces the main thread\'s thinking_delta, stream_delta and stream_end with one shared messageId', () => {
  const lines = loadFixtureLines().slice(1); // drop the marker line
  const events = replay(lines, 'sess-fixture');

  const thinkingDeltas = events.filter((e) => e.kind === 'thinking_delta');
  const textDeltas = events.filter((e) => e.kind === 'stream_delta');
  const streamEnds = events.filter((e) => e.kind === 'stream_end');

  assert.equal(thinkingDeltas.length, 3);
  assert.equal(textDeltas.length, 3);
  // One stream_end per block that actually streamed (thinking, text, Read tool_use, Task tool_use).
  assert.equal(streamEnds.length, 4);

  const mainMessageIds = new Set([...thinkingDeltas, ...textDeltas, ...streamEnds].map((e) => e.messageId));
  assert.equal(mainMessageIds.size, 1);
  const [messageId] = mainMessageIds;
  assert.ok(typeof messageId === 'string' && messageId.length > 0);

  assert.equal(thinkingDeltas.map((e) => e.content).join(''), 'El usuario quiere que revise el archivo antes de tocarlo.');
  assert.equal(textDeltas.map((e) => e.content).join(''), 'Voy a revisar el archivo.');

  // The thinking block is index 0, the text block index 1 — every delta/end for
  // one block shares its blockIndex.
  assert.deepEqual(new Set(thinkingDeltas.map((e) => e.blockIndex)), new Set([0]));
  assert.deepEqual(new Set(textDeltas.map((e) => e.blockIndex)), new Set([1]));
});

test('the final complete text and thinking rows carry the same messageId the partials streamed under', () => {
  const lines = loadFixtureLines().slice(1);
  const events = replay(lines, 'sess-fixture');

  const streamDelta = events.find((e) => e.kind === 'stream_delta');
  const finalText = events.find((e) => e.kind === 'text' && e.role === 'assistant' && !e.parentToolUseId);
  const finalThinking = events.find((e) => e.kind === 'thinking' && !e.parentToolUseId);

  assert.ok(streamDelta?.messageId);
  assert.equal(finalText?.messageId, streamDelta?.messageId);
  assert.equal(finalThinking?.messageId, streamDelta?.messageId);
  assert.equal(finalText?.content, 'Voy a revisar el archivo.');
  assert.equal(finalThinking?.blockIndex, 0);
  assert.equal(finalText?.blockIndex, 1);
});

test('the subagent\'s content_block_start reaches the client as an activity; its deltas and stop do not', () => {
  const lines = loadFixtureLines().slice(1);
  const events = replay(lines, 'sess-fixture');

  const subagentEvents = events.filter((e) => e.parentToolUseId === 'toolu_01_task_agent');
  const subagentActivities = subagentEvents.filter((e) => e.kind === 'activity');
  const subagentDeltas = subagentEvents.filter((e) => e.kind === 'stream_delta' || e.kind === 'thinking_delta');
  const subagentStreamEnds = subagentEvents.filter((e) => e.kind === 'stream_end');

  assert.equal(subagentDeltas.length, 0, 'a subagent never streams text/thinking to the main thread');
  assert.equal(subagentStreamEnds.length, 0, 'a subagent\'s content_block_stop never crosses either');
  assert.equal(subagentActivities.length, 2, 'one activity for its thinking block, one for its tool_use block');
  assert.deepEqual(subagentActivities.map((e) => e.activityKind), ['thinking', 'tool']);
  assert.equal(subagentActivities[1]?.toolName, 'Bash');
  // The leaked main-thread messageId must have been stripped, not just left unset by chance.
  assert.equal(subagentActivities.every((e) => e.messageId === undefined), true);

  const subagentFinalText = subagentEvents.find((e) => e.kind === 'text');
  assert.equal(subagentFinalText?.content, 'El repo usa 2 espacios y comillas simples; convenciones completas en CLAUDE.md.');
});
