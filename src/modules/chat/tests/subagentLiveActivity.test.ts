import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { NormalizedMessage } from '@/shared/types';
import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';

/**
 * Fase 6: a subagent's `activity` (its `content_block_start`, the only
 * partial the server lets cross for a subagent — docs/architecture/
 * protocolo-streaming.md, "Subagentes: solo activity cruza, nunca su texto")
 * folds into its Agent/Task container as a live "tool in progress" signal,
 * cleared the moment a full entry (tool_use, tool_result, text or thinking)
 * resolves it.
 */

function message(id: string, overrides: Partial<NormalizedMessage>): NormalizedMessage {
  return {
    id,
    sessionId: 'session-1',
    timestamp: '2026-10-05T12:00:00.000Z',
    provider: 'claude',
    kind: 'text',
    role: 'assistant',
    content: id,
    ...overrides,
  };
}

const taskRow = (toolId: string, description: string) => message(`task-${toolId}`, {
  kind: 'tool_use',
  toolId,
  toolName: 'Agent',
  toolInput: { description },
});

const subagentActivity = (id: string, parentToolUseId: string, activityKind: 'thinking' | 'tool', toolName?: string) => message(id, {
  kind: 'activity',
  activityKind,
  toolName,
  parentToolUseId,
});

test('a subagent activity event sets the container\'s current activity', () => {
  const converted = normalizedToChatMessages([
    taskRow('task-1', 'demo'),
    subagentActivity('act-1', 'task-1', 'tool', 'Bash'),
  ]);

  assert.equal(converted.length, 1);
  assert.deepEqual(converted[0].subagentCurrentActivity, { activityKind: 'tool', toolName: 'Bash' });
});

test('a "thinking" activity event carries no tool name', () => {
  const converted = normalizedToChatMessages([
    taskRow('task-1', 'demo'),
    subagentActivity('act-1', 'task-1', 'thinking'),
  ]);

  assert.deepEqual(converted[0].subagentCurrentActivity, { activityKind: 'thinking', toolName: undefined });
});

test('current activity clears once the matching tool_use entry arrives', () => {
  const converted = normalizedToChatMessages([
    taskRow('task-1', 'demo'),
    subagentActivity('act-1', 'task-1', 'tool', 'Bash'),
    message('step-1', {
      kind: 'tool_use',
      toolId: 'bash-1',
      toolName: 'Bash',
      toolInput: { command: 'echo hi' },
      parentToolUseId: 'task-1',
    }),
  ]);

  assert.equal(converted[0].subagentCurrentActivity, undefined);
  assert.equal(converted[0].subagentActivity?.length, 1);
});

test('current activity clears once the matching tool_result arrives', () => {
  const converted = normalizedToChatMessages([
    taskRow('task-1', 'demo'),
    message('step-1', {
      kind: 'tool_use',
      toolId: 'bash-1',
      toolName: 'Bash',
      toolInput: { command: 'echo hi' },
      parentToolUseId: 'task-1',
    }),
    subagentActivity('act-1', 'task-1', 'thinking'),
    message('result-1', {
      kind: 'tool_result',
      toolId: 'bash-1',
      content: 'hi',
      parentToolUseId: 'task-1',
    }),
  ]);

  assert.equal(converted[0].subagentCurrentActivity, undefined);
});

test('current activity clears once a text entry from the subagent arrives', () => {
  const converted = normalizedToChatMessages([
    taskRow('task-1', 'demo'),
    subagentActivity('act-1', 'task-1', 'tool', 'Bash'),
    message('text-1', { parentToolUseId: 'task-1', content: 'Done with the tool.' }),
  ]);

  assert.equal(converted[0].subagentCurrentActivity, undefined);
  assert.equal(converted[0].subagentActivity?.length, 1);
});

test('two parallel subagents each keep their own current activity', () => {
  const converted = normalizedToChatMessages([
    taskRow('task-a', 'Tarea A'),
    taskRow('task-b', 'Tarea B'),
    subagentActivity('act-a', 'task-a', 'tool', 'Bash'),
    subagentActivity('act-b', 'task-b', 'tool', 'Read'),
  ]);

  assert.equal(converted.length, 2);
  // The projection serializes `toolInput` to a JSON string for display.
  const byDescription = (description: string) => converted.find((msg) => {
    try {
      return JSON.parse(String(msg.toolInput)).description === description;
    } catch {
      return false;
    }
  });
  const a = byDescription('Tarea A');
  const b = byDescription('Tarea B');
  assert.deepEqual(a?.subagentCurrentActivity, { activityKind: 'tool', toolName: 'Bash' });
  assert.deepEqual(b?.subagentCurrentActivity, { activityKind: 'tool', toolName: 'Read' });
});

test('the cached projection rebuilds when only the current activity changes', () => {
  const task = taskRow('task-1', 'demo');
  const withoutActivity = normalizedToChatMessages([task]);
  assert.equal(withoutActivity[0].subagentCurrentActivity, undefined);

  const act = subagentActivity('act-1', 'task-1', 'tool', 'Bash');
  const withActivity = normalizedToChatMessages([task, act]);
  assert.deepEqual(withActivity[0].subagentCurrentActivity, { activityKind: 'tool', toolName: 'Bash' });
});
