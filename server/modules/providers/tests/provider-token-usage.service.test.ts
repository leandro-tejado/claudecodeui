import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import {
  claudeContextWindowIsAmbiguous,
  createProviderTokenUsageService,
  resolveClaudeContextWindow,
  summarizeClaudeTokenUsage,
} from '@/modules/providers/services/provider-token-usage.service.js';
import { AppError } from '@/shared/utils.js';

function createSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'app-session',
    provider: 'claude',
    provider_session_id: 'provider-session',
    project_path: null,
    jsonl_path: null,
    custom_name: null,
    model: null,
    effort: null,
    forked_from_session_id: null,
    isArchived: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('token usage lookup requires only the app-facing session id for Claude', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'provider-token-usage-claude-'));
  const sessionFilePath = path.join(tempDirectory, 'provider-session.jsonl');

  try {
    await writeFile(sessionFilePath, [
      JSON.stringify({
        type: 'assistant',
        message: {
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 5,
            output_tokens: 30,
          },
        },
      }),
      '{incomplete',
    ].join('\n'));

    const service = createProviderTokenUsageService({
      getSessionById: () => createSessionRow({ jsonl_path: sessionFilePath }),
      getClaudeContextWindow: () => '180000',
    });

    assert.deepEqual(await service.getSessionTokenUsage('app-session'), {
      used: 155,
      total: 180_000,
      inputTokens: 125,
      outputTokens: 30,
      cacheReadTokens: 20,
      cacheCreationTokens: 5,
      cacheTokens: 25,
      breakdown: { input: 125, output: 30 },
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('Codex token usage uses the latest token_count snapshot', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'provider-token-usage-codex-'));
  const sessionFilePath = path.join(tempDirectory, 'rollout-provider-session.jsonl');

  try {
    await writeFile(sessionFilePath, [
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
            model_context_window: 100_000,
          },
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 40, output_tokens: 9, total_tokens: 49 },
            model_context_window: 250_000,
          },
        },
      }),
    ].join('\n'));

    const service = createProviderTokenUsageService({
      getSessionById: () => createSessionRow({
        provider: 'codex',
        jsonl_path: sessionFilePath,
      }),
    });

    assert.deepEqual(await service.getSessionTokenUsage('app-session'), {
      used: 49,
      total: 250_000,
      inputTokens: 40,
      outputTokens: 9,
      breakdown: { input: 40, output: 9 },
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('OpenCode token usage resolves its provider-native id from the session row', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'provider-token-usage-opencode-'));
  const databasePath = path.join(tempDirectory, 'opencode.db');
  const database = new Database(databasePath);

  try {
    database.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        tokens_input INTEGER,
        tokens_output INTEGER,
        tokens_reasoning INTEGER,
        tokens_cache_read INTEGER,
        tokens_cache_write INTEGER
      )
    `);
    database.prepare(`
      INSERT INTO session (
        id,
        tokens_input,
        tokens_output,
        tokens_reasoning,
        tokens_cache_read,
        tokens_cache_write
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('provider-session', 12, 7, 3, 5, 2);
  } finally {
    database.close();
  }

  try {
    const service = createProviderTokenUsageService({
      getSessionById: () => createSessionRow({ provider: 'opencode' }),
      getOpenCodeDatabasePath: () => databasePath,
    });

    assert.deepEqual(await service.getSessionTokenUsage('app-session'), {
      used: 29,
      inputTokens: 17,
      outputTokens: 7,
      breakdown: { input: 17, output: 7 },
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('Cursor returns an explicit unsupported token usage result', async () => {
  const service = createProviderTokenUsageService({
    getSessionById: () => createSessionRow({ provider: 'cursor' }),
  });

  const result = await service.getSessionTokenUsage('app-session');

  assert.equal(result.unsupported, true);
  assert.equal(result.used, 0);
  assert.equal(result.total, 0);
});

test('token usage reports SESSION_NOT_FOUND for an unknown app session id', async () => {
  const service = createProviderTokenUsageService({ getSessionById: () => null });

  await assert.rejects(
    () => service.getSessionTokenUsage('missing-session'),
    (error: unknown) => (
      error instanceof AppError
      && error.code === 'SESSION_NOT_FOUND'
      && error.statusCode === 404
    ),
  );
});

test('the Claude summarizer reads the newest assistant turn, not the whole conversation', () => {
  const entries = [
    { type: 'assistant', message: { usage: { input_tokens: 5, cache_read_input_tokens: 1000, output_tokens: 50 } } },
    { type: 'user', message: { role: 'user', content: 'next' } },
    // The newest turn's prompt is the whole context, so its cache_read already
    // includes everything before it. Summing turns would double-count.
    { type: 'assistant', message: { usage: { input_tokens: 3, cache_read_input_tokens: 4000, cache_creation_input_tokens: 100, output_tokens: 80 } } },
  ];

  assert.deepEqual(summarizeClaudeTokenUsage(entries, '200000'), {
    used: 4183,
    total: 200_000,
    inputTokens: 4103,
    outputTokens: 80,
    cacheReadTokens: 4000,
    cacheCreationTokens: 100,
    cacheTokens: 4100,
    breakdown: { input: 4103, output: 80 },
  });
});

test('the Claude summarizer skips synthetic rows that carry an all-zero usage block', () => {
  // Interrupts, API errors and "No response requested." are written as
  // assistant rows with a fully zeroed usage block. Reading one as the newest
  // turn dropped the composer counter to 0 until the next turn pushed it back.
  const entries = [
    { type: 'assistant', message: { usage: { input_tokens: 3, cache_read_input_tokens: 4000, output_tokens: 80 } } },
    {
      type: 'assistant',
      message: {
        model: '<synthetic>',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    },
  ];

  assert.equal(summarizeClaudeTokenUsage(entries, '200000').used, 4083);
});

test('the Claude summarizer skips a subagent sidechain turn', () => {
  // A sidechain turn reports the subagent's own context window. Reading it
  // made the counter drop to the subagent's number mid-run.
  const entries = [
    { type: 'assistant', message: { usage: { input_tokens: 3, cache_read_input_tokens: 4000, output_tokens: 80 } } },
    {
      type: 'assistant',
      isSidechain: true,
      message: { usage: { input_tokens: 10, cache_read_input_tokens: 900, output_tokens: 5 } },
    },
  ];

  assert.equal(summarizeClaudeTokenUsage(entries, '200000').used, 4083);
});

test('the Claude summarizer reports zero for a transcript with no assistant turn yet', () => {
  const usage = summarizeClaudeTokenUsage([{ type: 'user', message: { role: 'user', content: 'hi' } }], '200000');

  assert.equal(usage.used, 0);
  assert.equal(usage.total, 200_000);
});

/** Padding rows large enough to push earlier rows out of the 4MB tail window. */
function paddingLines(totalBytes: number): string {
  const line = JSON.stringify({ type: 'attachment', filler: 'x'.repeat(4096) });
  return Array.from({ length: Math.ceil(totalBytes / line.length) }, () => line).join('\n');
}

test('Claude token usage reads only the tail of a large transcript', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'provider-token-usage-claude-tail-'));
  const sessionFilePath = path.join(tempDirectory, 'provider-session.jsonl');

  try {
    await writeFile(sessionFilePath, [
      paddingLines(5 * 1024 * 1024),
      JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 7, output_tokens: 2 } } }),
    ].join('\n'));

    const service = createProviderTokenUsageService({
      getSessionById: () => createSessionRow({ jsonl_path: sessionFilePath }),
      getClaudeContextWindow: () => '180000',
      // Reading the whole file here would defeat the tail read; fail loudly.
      readTextFile: () => { throw new Error('full read must not happen when the tail has usage'); },
    });

    const usage = await service.getSessionTokenUsage('app-session');
    assert.equal(usage.inputTokens, 7);
    assert.equal(usage.outputTokens, 2);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('Claude token usage falls back to the whole file when the tail has no usage row', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'provider-token-usage-claude-fallback-'));
  const sessionFilePath = path.join(tempDirectory, 'provider-session.jsonl');

  try {
    await writeFile(sessionFilePath, [
      JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 11, output_tokens: 3 } } }),
      paddingLines(5 * 1024 * 1024),
    ].join('\n'));

    const service = createProviderTokenUsageService({
      getSessionById: () => createSessionRow({ jsonl_path: sessionFilePath }),
      getClaudeContextWindow: () => '180000',
    });

    const usage = await service.getSessionTokenUsage('app-session');
    assert.equal(usage.inputTokens, 11);
    assert.equal(usage.outputTokens, 3);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('Codex token usage reads only the tail of a large rollout', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'provider-token-usage-codex-tail-'));
  const sessionFilePath = path.join(tempDirectory, 'rollout-provider-session.jsonl');

  try {
    await writeFile(sessionFilePath, [
      paddingLines(5 * 1024 * 1024),
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 21, output_tokens: 8, total_tokens: 29 },
            model_context_window: 150_000,
          },
        },
      }),
    ].join('\n'));

    const service = createProviderTokenUsageService({
      getSessionById: () => createSessionRow({ provider: 'codex', jsonl_path: sessionFilePath }),
      readTextFile: () => { throw new Error('full read must not happen when the tail has usage'); },
    });

    assert.deepEqual(await service.getSessionTokenUsage('app-session'), {
      used: 29,
      total: 150_000,
      inputTokens: 21,
      outputTokens: 8,
      breakdown: { input: 21, output: 8 },
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('Codex token usage falls back to the whole file when the tail has no token_count row', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'provider-token-usage-codex-fallback-'));
  const sessionFilePath = path.join(tempDirectory, 'rollout-provider-session.jsonl');

  try {
    await writeFile(sessionFilePath, [
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { total_token_usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 } },
        },
      }),
      paddingLines(5 * 1024 * 1024),
    ].join('\n'));

    const service = createProviderTokenUsageService({
      getSessionById: () => createSessionRow({ provider: 'codex', jsonl_path: sessionFilePath }),
    });

    const usage = await service.getSessionTokenUsage('app-session');
    assert.equal(usage.used, 6);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('the context window comes from the model that wrote the turn, not from CONTEXT_WINDOW', () => {
  // The meter read 75% of a 160K default while the session was actually running
  // a model with a bigger window — a full context looked four turns away when
  // it was not.
  const entries = [
    { type: 'assistant', message: { model: 'claude-opus-5', usage: { input_tokens: 3, cache_read_input_tokens: 4000, output_tokens: 80 } } },
  ];

  assert.equal(summarizeClaudeTokenUsage(entries, '160000').total, 200_000);
});

test('the identity row supplies the variant the assistant rows drop', () => {
  // Assistant rows record `claude-opus-5` whether the session runs the 200K
  // base or the 1M variant. Sizing a 1M session against 200K pinned the meter
  // at 100% from the first long turn — the 11-sep bug, second half.
  const entries = [
    { type: 'attachment', attachment: { type: 'model', identity: { modelId: 'claude-opus-5[1m]' } } },
    { type: 'assistant', message: { model: 'claude-opus-5', usage: { input_tokens: 3, cache_read_input_tokens: 336_000, output_tokens: 538 } } },
  ];

  const usage = summarizeClaudeTokenUsage(entries, '160000');
  assert.equal(usage.total, 1_000_000);
  assert.equal(usage.used, 336_541);
  assert.equal(Math.round((usage.used / (usage.total as number)) * 100), 34);
});

test('the identity row is ignored when a later turn ran a different model', () => {
  // Switching models mid-session must not carry the old variant over.
  const entries = [
    { type: 'attachment', attachment: { type: 'model', identity: { modelId: 'claude-opus-5[1m]' } } },
    { type: 'assistant', message: { model: 'claude-haiku-4-5', usage: { input_tokens: 3, cache_read_input_tokens: 500, output_tokens: 10 } } },
  ];

  assert.equal(summarizeClaudeTokenUsage(entries, '160000').total, 200_000);
});

test('an unknown model with no configured window reports no total at all', () => {
  // A total nobody can confirm is worse than none: the meter would measure a
  // real number against an invented window and read 100% on every long session.
  const entries = [
    { type: 'assistant', message: { model: 'some-other-model', usage: { input_tokens: 3, output_tokens: 80 } } },
  ];

  // Passing '' rather than undefined: undefined falls through to the default
  // parameter, which reads process.env — and a .env with CONTEXT_WINDOW set
  // would silently make this pass for the wrong reason.
  assert.equal(summarizeClaudeTokenUsage(entries, '').total, null);
});

test('a session that switches models resizes to the newest turn', () => {
  const entries = [
    { type: 'assistant', message: { model: 'claude-opus-5', usage: { input_tokens: 3, cache_read_input_tokens: 4000, output_tokens: 80 } } },
    { type: 'assistant', message: { model: 'claude-haiku-4-5', usage: { input_tokens: 3, cache_read_input_tokens: 500, output_tokens: 10 } } },
  ];

  assert.equal(summarizeClaudeTokenUsage(entries, '160000').total, 200_000);
});

test('an unknown model falls back to the configured window instead of inventing one', () => {
  const entries = [
    { type: 'assistant', message: { model: 'some-other-model', usage: { input_tokens: 3, cache_read_input_tokens: 4000, output_tokens: 80 } } },
  ];

  assert.equal(summarizeClaudeTokenUsage(entries, '160000').total, 160_000);
});

test('resolveClaudeContextWindow understands variants, snapshots and unknowns', () => {
  // Base ids sit at 200K: the picker lists `opus`/`opus[1m]` separately, which
  // is the proof that the plain id is not the million-token one.
  assert.equal(resolveClaudeContextWindow('claude-opus-5'), 200_000);
  assert.equal(resolveClaudeContextWindow('claude-sonnet-5'), 200_000);
  assert.equal(resolveClaudeContextWindow('claude-haiku-4-5'), 200_000);
  // Harness variant suffix written by Claude Code.
  assert.equal(resolveClaudeContextWindow('claude-opus-5[1m]'), 1_000_000);
  assert.equal(resolveClaudeContextWindow('claude-sonnet-5[1m]'), 1_000_000);
  // The picker's own aliases carry the suffix too, and arrive before any turn.
  assert.equal(resolveClaudeContextWindow('opus[1m]'), 1_000_000);
  // Dated snapshot ids resolve to their base model.
  assert.equal(resolveClaudeContextWindow('claude-haiku-4-5-20251001'), 200_000);
  assert.equal(resolveClaudeContextWindow('<synthetic>'), null);
  assert.equal(resolveClaudeContextWindow(null), null);
  assert.equal(resolveClaudeContextWindow(''), null);
});

test('ambiguous ids are the ones the picker splits into two variants', () => {
  // The live runtime only sees the requested model. For these ids it must
  // abstain, because the same string names a 200K session and a 1M one.
  assert.equal(claudeContextWindowIsAmbiguous('claude-opus-5'), true);
  assert.equal(claudeContextWindowIsAmbiguous('claude-sonnet-5'), true);
  assert.equal(claudeContextWindowIsAmbiguous('opus'), true);
  assert.equal(claudeContextWindowIsAmbiguous('sonnet'), true);
  // The suffix settles it, so these are not ambiguous.
  assert.equal(claudeContextWindowIsAmbiguous('opus[1m]'), false);
  assert.equal(claudeContextWindowIsAmbiguous('claude-opus-5[1m]'), false);
  // No variant is offered for these, so the id is the whole answer.
  assert.equal(claudeContextWindowIsAmbiguous('claude-haiku-4-5'), false);
  assert.equal(claudeContextWindowIsAmbiguous('default'), false);
  assert.equal(claudeContextWindowIsAmbiguous(null), false);
});
