import assert from 'node:assert/strict';

import { act, render, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type { ChatMessage } from '@/shared/types';
import SkinSubagentBridge from '@/modules/skin/SkinSubagentBridge';
import { resetSubagentStoreForTests, useSubagents } from '@/modules/skin/subagentStore';

/**
 * The sidebar's live subagent rows read this store; the bridge is its only
 * writer. These tests pin the two closing paths (a `tool_result` and, for an
 * async agent that never emits one, a matching `task_notification`), the
 * belt-and-sweep timers, and that unmounting a session's bridge does not leave
 * its rows behind for the next one.
 */

const taskMessage = (overrides: Partial<ChatMessage> & { toolId: string }): ChatMessage => ({
  type: 'assistant',
  content: '',
  timestamp: '2026-09-15T12:00:00.000Z',
  isToolUse: true,
  toolName: 'Task',
  toolInput: JSON.stringify({ description: 'Survey the repo', subagent_type: 'Explore', model: 'sonnet' }),
  toolResult: null,
  ...overrides,
});

const notification = (overrides: Partial<ChatMessage> & { toolId: string }): ChatMessage => ({
  type: 'assistant',
  content: 'Background task update',
  timestamp: '2026-09-15T12:05:00.000Z',
  isTaskNotification: true,
  taskNotificationStatus: 'completed',
  ...overrides,
});

beforeEach(() => {
  act(() => resetSubagentStoreForTests());
});

afterEach(() => {
  vi.useRealTimers();
});

test('two simultaneous Task rows give two running entries', () => {
  const { result } = renderHook(() => useSubagents());

  act(() => {
    render(
      <SkinSubagentBridge
        sessionId="session-1"
        messages={[
          taskMessage({ toolId: 'task-1' }),
          taskMessage({ toolId: 'task-2' }),
        ]}
      />,
    );
  });

  assert.equal(result.current.size, 2);
  assert.equal(result.current.get('task-1')?.status, 'running');
  assert.equal(result.current.get('task-2')?.status, 'running');
});

test('a tool_result moves the row to completed', () => {
  const { result } = renderHook(() => useSubagents());

  const view = render(
    <SkinSubagentBridge sessionId="session-1" messages={[taskMessage({ toolId: 'task-1' })]} />,
  );
  assert.equal(result.current.get('task-1')?.status, 'running');

  act(() => {
    view.rerender(
      <SkinSubagentBridge
        sessionId="session-1"
        messages={[
          taskMessage({
            toolId: 'task-1',
            toolResult: { content: 'done', isError: false },
          }),
        ]}
      />,
    );
  });

  assert.equal(result.current.get('task-1')?.status, 'completed');
});

test('a task_notification closes an async Task with no tool_result', () => {
  const { result } = renderHook(() => useSubagents());

  const view = render(
    <SkinSubagentBridge sessionId="session-1" messages={[taskMessage({ toolId: 'task-async' })]} />,
  );
  assert.equal(result.current.get('task-async')?.status, 'running');

  act(() => {
    view.rerender(
      <SkinSubagentBridge
        sessionId="session-1"
        messages={[
          taskMessage({ toolId: 'task-async' }),
          notification({ toolId: 'task-async', taskNotificationStatus: 'completed' }),
        ]}
      />,
    );
  });

  assert.equal(result.current.get('task-async')?.status, 'completed');
});

test('15 minutes with no events turns the row stale, and it stays', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useSubagents());

  act(() => {
    render(<SkinSubagentBridge sessionId="session-1" messages={[taskMessage({ toolId: 'task-1' })]} />);
  });
  assert.equal(result.current.get('task-1')?.status, 'running');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
  });

  assert.equal(result.current.get('task-1')?.status, 'stale');
  assert.equal(result.current.has('task-1'), true);
});

test('a completed row sweeps away after 10s', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useSubagents());

  const view = render(
    <SkinSubagentBridge sessionId="session-1" messages={[taskMessage({ toolId: 'task-1' })]} />,
  );

  act(() => {
    view.rerender(
      <SkinSubagentBridge
        sessionId="session-1"
        messages={[
          taskMessage({ toolId: 'task-1', toolResult: { content: 'done', isError: false } }),
        ]}
      />,
    );
  });
  assert.equal(result.current.get('task-1')?.status, 'completed');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });

  assert.equal(result.current.has('task-1'), false);
});

test('unmounting the bridge empties the store', () => {
  const { result } = renderHook(() => useSubagents());

  const view = render(
    <SkinSubagentBridge
      sessionId="session-1"
      messages={[taskMessage({ toolId: 'task-1' }), taskMessage({ toolId: 'task-2' })]}
    />,
  );
  assert.equal(result.current.size, 2);

  act(() => view.unmount());

  assert.equal(result.current.size, 0);
});

test('the store does not re-render when nothing changed', () => {
  let renders = 0;
  renderHook(() => {
    renders += 1;
    return useSubagents();
  });

  const view = render(
    <SkinSubagentBridge sessionId="session-1" messages={[taskMessage({ toolId: 'task-1' })]} />,
  );
  const after = renders;

  // Same data, new array and message identities — the chat re-renders on
  // every stream delta even when a given row has not changed.
  act(() => {
    view.rerender(
      <SkinSubagentBridge sessionId="session-1" messages={[taskMessage({ toolId: 'task-1' })]} />,
    );
  });

  assert.equal(renders, after);
});
