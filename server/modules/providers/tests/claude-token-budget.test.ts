import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractCompactBoundaryTokenBudget,
  extractCumulativeTokenBudget,
  extractTokenBudget,
} from '@/modules/providers/list/claude/claude-runtime.provider.js';

test('assistant usage produces a cumulative budget', () => {
  const budget = extractTokenBudget({
    type: 'assistant',
    message: {
      usage: {
        input_tokens: 12,
        cache_read_input_tokens: 40_000,
        cache_creation_input_tokens: 2_000,
        output_tokens: 500,
      },
    },
  });

  assert.ok(budget);
  assert.equal(budget.inputTokens, 42_012);
  assert.equal(budget.outputTokens, 500);
  assert.equal(budget.used, 42_512);
});

test('system task events with tool-usage shaped usage emit no budget', () => {
  // task_progress/task_notification carry usage {total_tokens, tool_uses,
  // duration_ms}; reading Anthropic keys off it produced a used: 0 budget
  // that flashed "0" in the composer mid-generation.
  const budget = extractTokenBudget({
    type: 'system',
    subtype: 'task_progress',
    task_id: 't-1',
    usage: { total_tokens: 5_000, tool_uses: 3, duration_ms: 1_200 },
  });

  assert.equal(budget, null);
});

test('subagent messages emit no budget for the parent session', () => {
  // A subagent's usage is its own context window; surfacing it made the
  // session counter drop to the subagent's number and bounce back.
  const budget = extractTokenBudget({
    type: 'assistant',
    parent_tool_use_id: 'toolu_123',
    message: { usage: { input_tokens: 900, output_tokens: 10 } },
  });

  assert.equal(budget, null);
});

test('a turn-ending result emits no budget', () => {
  // `result.usage` is the turn's bill: every request it made, summed, each
  // subagent's included. A four-request turn therefore reports roughly four
  // times the context the conversation holds, so publishing it made the
  // counter leap when the turn ended and fall back on the next turn's first
  // assistant message.
  const budget = extractTokenBudget({
    type: 'result',
    usage: {
      input_tokens: 18,
      cache_creation_input_tokens: 8_138,
      cache_read_input_tokens: 40_460,
      output_tokens: 166,
    },
    modelUsage: {
      'claude-sonnet-5': { inputTokens: 929, outputTokens: 177 },
    },
  });

  assert.equal(budget, null);
});

test('the cumulative reader stays available for SDK builds with no assistant usage', () => {
  const fromUsage = extractCumulativeTokenBudget({
    type: 'result',
    usage: { input_tokens: 18, cache_read_input_tokens: 40_460, output_tokens: 166 },
  });

  assert.ok(fromUsage);
  assert.equal(fromUsage.used, 40_644);

  const fromModelUsage = extractCumulativeTokenBudget({
    type: 'result',
    modelUsage: {
      'claude-sonnet-5': { cumulativeInputTokens: 1_000, cumulativeOutputTokens: 200 },
    },
  });

  assert.ok(fromModelUsage);
  assert.equal(fromModelUsage.used, 1_200);
});

test('the cumulative reader ignores anything that is not a result', () => {
  assert.equal(
    extractCumulativeTokenBudget({
      type: 'assistant',
      message: { usage: { input_tokens: 10, output_tokens: 2 } },
    }),
    null,
  );
});

test('a compact boundary produces a budget from post_tokens', () => {
  // `/compact` emits a `system`/`compact_boundary` message that
  // `extractTokenBudget` drops (it only reads `assistant` messages), which
  // otherwise leaves the composer's indicator pinned at its pre-compact
  // number until the next assistant turn reports usage.
  const budget = extractCompactBoundaryTokenBudget({
    type: 'system',
    subtype: 'compact_boundary',
    compact_metadata: { trigger: 'manual', pre_tokens: 166_000, post_tokens: 8_500 },
  });

  assert.ok(budget);
  assert.equal(budget.inputTokens, 8_500);
  assert.equal(budget.outputTokens, 0);
  assert.equal(budget.used, 8_500);
});

test('a compact boundary without post_tokens emits no budget', () => {
  // Auto-compaction can fire mid-stream before the SDK has settled on a
  // final post-compaction size; nothing to report yet.
  assert.equal(
    extractCompactBoundaryTokenBudget({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'auto', pre_tokens: 166_000 },
    }),
    null,
  );
});

test('the compact boundary reader ignores non-compact system messages', () => {
  assert.equal(
    extractCompactBoundaryTokenBudget({
      type: 'system',
      subtype: 'task_progress',
      usage: { total_tokens: 5_000 },
    }),
    null,
  );
});

test('the requested model sizes the window, not the id the turn reports', () => {
  // The picker sends `opus[1m]`; the SDK writes `claude-opus-5` flat on every
  // assistant message. Reading only the turn's id sized a 1M session against
  // the 200K base and pinned the meter at 100% past the first long turn.
  const budget = extractTokenBudget(
    {
      type: 'assistant',
      message: {
        model: 'claude-opus-5',
        usage: { input_tokens: 3, cache_read_input_tokens: 336_000, output_tokens: 538 },
      },
    },
    'opus[1m]',
  );

  assert.ok(budget);
  assert.equal(budget.total, 1_000_000);
  assert.equal(budget.used, 336_541);
  assert.equal(Math.round((budget.used / budget.total) * 100), 34);
});

test('a request with no variant reports no total instead of guessing one', () => {
  // Sessions recorded before the picker stored variants keep a bare
  // `claude-opus-5` or a `default`, and the turn's own id never carries the
  // suffix. Answering 200K there would size a 1M session against the base and
  // pin the meter at 100%. A null total means "keep the transcript's figure".
  const previous = process.env.CONTEXT_WINDOW;
  delete process.env.CONTEXT_WINDOW;
  try {
    for (const requested of ['opus', 'default', 'claude-opus-5', null]) {
      const budget = extractTokenBudget(
        { type: 'assistant', message: { model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 2 } } },
        requested,
      );

      assert.ok(budget);
      assert.equal(budget.total, null, `requested: ${requested}`);
    }
  } finally {
    if (previous !== undefined) process.env.CONTEXT_WINDOW = previous;
  }
});

test('a compact boundary is sized by the requested model like any other turn', () => {
  // `compact_boundary` is a `system` message with no model of its own; before
  // this it fell through to no window at all and the meter stayed pinned at
  // its pre-compact number.
  const budget = extractCompactBoundaryTokenBudget(
    { type: 'system', subtype: 'compact_boundary', compact_metadata: { post_tokens: 54_000 } },
    'opus[1m]',
  );

  assert.ok(budget);
  assert.equal(budget.total, 1_000_000);
  assert.equal(budget.used, 54_000);
});

test('an unknown model with no CONTEXT_WINDOW reports no total', () => {
  // The meter skips drawing rather than measure a real number against a window
  // nobody confirmed. Inventing one is what made every long session read 100%.
  const previous = process.env.CONTEXT_WINDOW;
  delete process.env.CONTEXT_WINDOW;
  try {
    const budget = extractTokenBudget(
      { type: 'assistant', message: { model: 'some-other-model', usage: { input_tokens: 10, output_tokens: 2 } } },
      'some-other-model',
    );

    assert.ok(budget);
    assert.equal(budget.total, null);
  } finally {
    if (previous !== undefined) process.env.CONTEXT_WINDOW = previous;
  }
});

test('CONTEXT_WINDOW still works as a deliberate override for unknown models', () => {
  const previous = process.env.CONTEXT_WINDOW;
  process.env.CONTEXT_WINDOW = '250000';
  try {
    const budget = extractTokenBudget(
      { type: 'assistant', message: { model: 'some-other-model', usage: { input_tokens: 10, output_tokens: 2 } } },
      'some-other-model',
    );

    assert.ok(budget);
    assert.equal(budget.total, 250_000);
  } finally {
    if (previous === undefined) delete process.env.CONTEXT_WINDOW;
    else process.env.CONTEXT_WINDOW = previous;
  }
});
