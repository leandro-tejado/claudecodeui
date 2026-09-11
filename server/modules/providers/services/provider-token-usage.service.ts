import fsSync, { type Dirent } from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { sessionsDb } from '@/modules/database/index.js';
import type { AnyRecord } from '@/shared/types.js';
import { AppError, getOpenCodeDatabasePath } from '@/shared/utils.js';

type SessionRow = NonNullable<ReturnType<typeof sessionsDb.getSessionById>>;

type FileTail = {
  content: string;
  /** True when `content` is the whole file, not just its trailing bytes. */
  isComplete: boolean;
};

type ProviderTokenUsageServiceDependencies = {
  getSessionById: (sessionId: string) => SessionRow | null | undefined;
  getHomeDirectory: () => string;
  getOpenCodeDatabasePath: () => string;
  fileExists: (filePath: string) => boolean;
  readDirectory: (directoryPath: string) => Promise<Dirent[]>;
  readTextFile: (filePath: string) => Promise<string>;
  readTextFileTail: (filePath: string, maxBytes: number) => Promise<FileTail>;
  getClaudeContextWindow: () => string | undefined;
  isProviderSessionSuperseded: (providerSessionId: string, provider: string) => boolean;
};

type TokenUsageResult = {
  used: number;
  /** `null` when no model could size the window — the meter skips drawing. */
  total?: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cacheTokens?: number;
  breakdown: {
    input: number;
    output: number;
  };
  unsupported?: boolean;
  message?: string;
};

type OpenCodeTokenRow = {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
};

/**
 * Both JSONL usage readers below only need the newest usage row, which sits at
 * or near the end of the transcript. Reading just this much of the tail keeps
 * a session-open usage lookup O(1) in the transcript's size; the rare tail
 * with no usage row at all falls back to the full read.
 */
const TOKEN_USAGE_TAIL_BYTES = 4 * 1024 * 1024;

const defaultDependencies: ProviderTokenUsageServiceDependencies = {
  getSessionById: (sessionId) => sessionsDb.getSessionById(sessionId),
  getHomeDirectory: () => os.homedir(),
  getOpenCodeDatabasePath,
  fileExists: (filePath) => fsSync.existsSync(filePath),
  readDirectory: (directoryPath) => fsp.readdir(directoryPath, { withFileTypes: true }),
  readTextFile: (filePath) => fsp.readFile(filePath, 'utf8'),
  readTextFileTail: async (filePath, maxBytes) => {
    const handle = await fsp.open(filePath, 'r');
    try {
      const { size } = await handle.stat();
      if (size <= maxBytes) {
        return { content: await handle.readFile({ encoding: 'utf8' }), isComplete: true };
      }

      const buffer = Buffer.alloc(maxBytes);
      await handle.read(buffer, 0, maxBytes, size - maxBytes);
      const content = buffer.toString('utf8');
      // The window almost never starts on a row boundary; dropping everything
      // up to the first newline discards the partial row (and any split
      // multi-byte character with it).
      const firstNewline = content.indexOf('\n');
      return {
        content: firstNewline === -1 ? '' : content.slice(firstNewline + 1),
        isComplete: false,
      };
    } finally {
      await handle.close();
    }
  },
  getClaudeContextWindow: () => process.env.CONTEXT_WINDOW,
  isProviderSessionSuperseded: (providerSessionId, provider) =>
    sessionsDb.isProviderSessionSuperseded(providerSessionId, provider),
};

function readUsageNumber(value: unknown): number {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

async function findCodexSessionFile(
  directoryPath: string,
  providerSessionId: string,
  dependencies: ProviderTokenUsageServiceDependencies,
): Promise<string | null> {
  let entries: Dirent[];
  try {
    entries = await dependencies.readDirectory(directoryPath);
  } catch {
    // Codex session folders are date-partitioned and can disappear while a
    // cleanup is running. An unreadable branch is simply not a match.
    return null;
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nestedMatch = await findCodexSessionFile(entryPath, providerSessionId, dependencies);
      if (nestedMatch) {
        return nestedMatch;
      }
      continue;
    }

    if (entry.name.includes(providerSessionId) && entry.name.endsWith('.jsonl')) {
      return entryPath;
    }
  }

  return null;
}

/** Newest `token_count` snapshot in the given JSONL text, or null when it has none. */
function findCodexTokenUsage(fileContent: string): TokenUsageResult | null {
  const lines = fileContent.trim().split('\n');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index]) as AnyRecord;
      const tokenInfo = entry.type === 'event_msg' && entry.payload?.type === 'token_count'
        ? entry.payload.info
        : null;
      if (!tokenInfo) {
        continue;
      }

      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;
      if (tokenInfo.total_token_usage) {
        inputTokens = readUsageNumber(tokenInfo.total_token_usage.input_tokens);
        outputTokens = readUsageNumber(tokenInfo.total_token_usage.output_tokens);
        totalTokens = readUsageNumber(tokenInfo.total_token_usage.total_tokens)
          || inputTokens + outputTokens;
      }
      return {
        used: totalTokens,
        total: readUsageNumber(tokenInfo.model_context_window) || 200_000,
        inputTokens,
        outputTokens,
        breakdown: { input: inputTokens, output: outputTokens },
      };
    } catch {
      // A provider may be writing the last JSONL line while this read happens.
    }
  }

  return null;
}

function emptyCodexTokenUsage(): TokenUsageResult {
  return {
    used: 0,
    total: 200_000,
    inputTokens: 0,
    outputTokens: 0,
    breakdown: { input: 0, output: 0 },
  };
}

/**
 * Context window per model id, in tokens. Anthropic model docs, cached
 * 2026-06-24. Only documented models are listed: an unknown id resolves to
 * null so the caller falls back instead of inventing a number.
 *
 * `claude-opus-5` and `claude-sonnet-5` sit at the 200K base because the model
 * picker offers `opus`/`opus[1m]` and `sonnet`/`sonnet[1m]` as separate
 * entries — the proof that the plain id is not the million-token one. The
 * variant is read from the `[1m]` suffix below.
 *
 * The older Opus/Sonnet ids and the Fable/Mythos family stay where they were:
 * there is no picker entry proving a split for them, and guessing 200K on a
 * model that really holds 1M would bring back the very bug this fixed — every
 * long session pinned at 100%.
 */
const CLAUDE_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-fable-5-1': 1_000_000,
  'claude-fable-5': 1_000_000,
  'claude-mythos-5-1': 1_000_000,
  'claude-opus-5': 200_000,
  'claude-opus-4-8': 1_000_000,
  'claude-opus-4-7': 1_000_000,
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-5': 200_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-haiku-4-5': 200_000,
};

/**
 * Models the picker offers in both a base and a `[1m]` flavour, by normalized
 * id — the picker's own aliases included, since a session records the alias.
 *
 * A bare id from this set is genuinely ambiguous: the same string names a 200K
 * session and a 1M one. Callers that cannot consult the transcript must say so
 * instead of picking one.
 */
const CLAUDE_AMBIGUOUS_WINDOW_MODELS = new Set(['claude-opus-5', 'claude-sonnet-5', 'opus', 'sonnet']);

/**
 * True when a model id names a window that cannot be pinned down from the id.
 *
 * The live runtime only ever sees the requested model, so for these ids it has
 * to abstain and let the transcript reader — which has `identity.modelId` —
 * supply the window.
 */
export function claudeContextWindowIsAmbiguous(model: unknown): boolean {
  if (typeof model !== 'string' || model.length === 0) {
    return false;
  }
  if (/\[\d+m\]$/i.test(model)) {
    return false; // the suffix settles it
  }
  return CLAUDE_AMBIGUOUS_WINDOW_MODELS.has(normalizeModelId(model));
}

/** Strips the harness variant suffix and any dated snapshot from a model id. */
function normalizeModelId(model: string): string {
  return model
    .replace(/\[[^\]]*\]$/, '')
    .replace(/-\d{8}$/, ''); // dated snapshot, e.g. claude-haiku-4-5-20251001
}

/**
 * Context window for the model that actually produced a turn.
 *
 * The transcript records the model per assistant row, so the meter can size
 * itself instead of trusting one global CONTEXT_WINDOW that goes stale the
 * moment the user switches models mid-session.
 */
export function resolveClaudeContextWindow(model: unknown): number | null {
  if (typeof model !== 'string' || model.length === 0) {
    return null;
  }

  // Claude Code marks harness variants with a bracket suffix: `claude-opus-5[1m]`
  // is the million-token variant of the same published id.
  const variant = model.match(/\[(\d+)m\]$/i);
  if (variant) {
    return Number(variant[1]) * 1_000_000;
  }

  const id = normalizeModelId(model);

  const exact = CLAUDE_CONTEXT_WINDOWS[id];
  if (exact !== undefined) {
    return exact;
  }

  // Longest documented prefix wins, so an unseen regional or dated variant of a
  // known model still resolves rather than silently taking the fallback.
  let best: number | null = null;
  let bestLength = 0;
  for (const [knownId, window] of Object.entries(CLAUDE_CONTEXT_WINDOWS)) {
    if (id.startsWith(`${knownId}-`) && knownId.length > bestLength) {
      best = window;
      bestLength = knownId.length;
    }
  }
  return best;
}

/**
 * Model id the session was started with, variant suffix included.
 *
 * Assistant rows record the resolved id (`claude-opus-5`) and drop the harness
 * variant, so a 1M session is indistinguishable from a 200K one by that field
 * alone. Claude Code also writes an `attachment`/`model` row carrying
 * `identity.modelId` — `claude-opus-5[1m]` — and that is the only place in the
 * transcript where the variant survives. Read newest-first: a session that
 * switched models writes a fresh one.
 */
function readTranscriptModelIdentity(entries: AnyRecord[]): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const modelId = entries[index]?.attachment?.identity?.modelId;
    if (typeof modelId === 'string' && modelId.length > 0) {
      return modelId;
    }
  }
  return null;
}

/**
 * Latest context-window usage from a Claude transcript's already-parsed rows.
 *
 * Exported because the session-messages reader hands the same usage back on
 * every history page, the way the Codex and OpenCode readers do. Without that,
 * a Claude session's counter only moved when the session was reselected, and
 * the store's "this provider reports no usage" path overwrote it with zero.
 *
 * Reads the newest assistant turn only: `input_tokens + cache_read +
 * cache_creation` is that one request's whole prompt, i.e. what the context
 * window currently holds. Summing turns would count the same cached prefix
 * once per turn.
 */
export function summarizeClaudeTokenUsage(
  entries: AnyRecord[],
  configuredContextWindow: string | undefined = process.env.CONTEXT_WINDOW,
): TokenUsageResult {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let modelId: unknown = null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    // A subagent's turns report the subagent's context window, not this
    // conversation's; reading one makes the counter drop to the subagent's
    // number and bounce back on the next main-thread turn.
    if (entry?.isSidechain === true) {
      continue;
    }

    const usage = entry?.type === 'assistant' ? entry.message?.usage : null;
    if (!usage) {
      continue;
    }

    const directInputTokens = readUsageNumber(usage.input_tokens ?? usage.inputTokens);
    const rowCacheReadTokens = readUsageNumber(
      usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? usage.cacheReadTokens,
    );
    const rowCacheCreationTokens = readUsageNumber(
      usage.cache_creation_input_tokens
        ?? usage.cacheCreationInputTokens
        ?? usage.cacheCreationTokens,
    );
    const rowInputTokens = directInputTokens + rowCacheReadTokens + rowCacheCreationTokens;
    const rowOutputTokens = readUsageNumber(usage.output_tokens ?? usage.outputTokens);

    // `<synthetic>` rows — interrupts, API errors, "No response requested" —
    // are written with an all-zero usage block rather than none at all. They
    // never carried a prompt, so treating one as the newest turn zeroed a
    // counter that a live event had just set correctly.
    if (rowInputTokens === 0 && rowOutputTokens === 0) {
      continue;
    }

    cacheReadTokens = rowCacheReadTokens;
    cacheCreationTokens = rowCacheCreationTokens;
    inputTokens = rowInputTokens;
    outputTokens = rowOutputTokens;
    modelId = entry.message?.model;
    break;
  }

  const parsedContextWindow = Number.parseInt(configuredContextWindow ?? '', 10);
  const fallbackContextWindow = Number.isFinite(parsedContextWindow) ? parsedContextWindow : null;
  // The model that wrote the turn wins: CONTEXT_WINDOW is one global number and
  // cannot follow a session that switches models. The identity row is preferred
  // over the turn's own id when both name the same model, because only it kept
  // the `[1m]` suffix that tells the two windows apart.
  const identityModelId = readTranscriptModelIdentity(entries);
  const variantModelId =
    typeof modelId === 'string'
    && identityModelId
    && normalizeModelId(identityModelId) === normalizeModelId(modelId)
      ? identityModelId
      : modelId;
  const contextWindow =
    resolveClaudeContextWindow(variantModelId)
    ?? resolveClaudeContextWindow(modelId)
    ?? fallbackContextWindow;
  const cacheTokens = cacheReadTokens + cacheCreationTokens;

  return {
    used: inputTokens + outputTokens,
    total: contextWindow,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    cacheTokens,
    breakdown: { input: inputTokens, output: outputTokens },
  };
}

function parseClaudeUsageEntries(fileContent: string): AnyRecord[] {
  const entries: AnyRecord[] = [];
  for (const line of fileContent.trim().split('\n')) {
    try {
      entries.push(JSON.parse(line) as AnyRecord);
    } catch {
      // Skip malformed lines without discarding usage from earlier messages.
    }
  }
  return entries;
}

function claudeEntriesHaveUsage(entries: AnyRecord[]): boolean {
  return entries.some((entry) => entry?.type === 'assistant' && entry.message?.usage);
}

function readOpenCodeTokenUsage(databasePath: string, providerSessionId: string): TokenUsageResult {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const columns = database.prepare('PRAGMA table_info(session)').all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    const requiredColumns = [
      'tokens_input',
      'tokens_output',
      'tokens_reasoning',
      'tokens_cache_read',
      'tokens_cache_write',
    ];

    if (!requiredColumns.every((column) => columnNames.has(column))) {
      return {
        used: 0,
        inputTokens: 0,
        outputTokens: 0,
        breakdown: { input: 0, output: 0 },
        unsupported: true,
        message: 'Token usage tracking is not available in this OpenCode database schema',
      };
    }

    const row = database.prepare(`
      SELECT
        tokens_input AS inputTokens,
        tokens_output AS outputTokens,
        tokens_reasoning AS reasoningTokens,
        tokens_cache_read AS cacheReadTokens,
        tokens_cache_write AS cacheWriteTokens
      FROM session
      WHERE id = ?
    `).get(providerSessionId) as OpenCodeTokenRow | undefined;

    if (!row) {
      throw new AppError('OpenCode session was not found.', {
        code: 'OPENCODE_SESSION_NOT_FOUND',
        statusCode: 404,
      });
    }

    const inputTokens = readUsageNumber(row.inputTokens) + readUsageNumber(row.cacheReadTokens);
    const outputTokens = readUsageNumber(row.outputTokens);
    const used = readUsageNumber(row.inputTokens)
      + outputTokens
      + readUsageNumber(row.reasoningTokens)
      + readUsageNumber(row.cacheReadTokens)
      + readUsageNumber(row.cacheWriteTokens);

    return {
      used,
      inputTokens,
      outputTokens,
      breakdown: { input: inputTokens, output: outputTokens },
    };
  } finally {
    database.close();
  }
}

/**
 * Creates the provider token-usage service used by the provider routes. The
 * provider test suite supplies isolated filesystem and session dependencies so
 * every calculator can be exercised without touching a developer's real data.
 */
export function createProviderTokenUsageService(
  dependencyOverrides: Partial<ProviderTokenUsageServiceDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };

  return {
    /**
     * Resolves all provider-specific storage details from one app-facing
     * session id, then returns the latest usage snapshot for that provider.
     */
    async getSessionTokenUsage(sessionId: string): Promise<TokenUsageResult> {
      const session = dependencies.getSessionById(sessionId);
      if (!session) {
        throw new AppError(`Session "${sessionId}" was not found.`, {
          code: 'SESSION_NOT_FOUND',
          statusCode: 404,
        });
      }

      // The fallback covers rows whose provider id was never recorded, and for
      // a session discovered from disk the app id *is* its provider id. That
      // stops being true the moment an edit rewinds the conversation off a
      // thread: until the replacement run announces its own id, the fallback
      // would resolve the retired transcript and report the discarded
      // conversation's usage against an empty one.
      if (
        !session.provider_session_id
        && dependencies.isProviderSessionSuperseded(sessionId, session.provider)
      ) {
        return {
          used: 0,
          inputTokens: 0,
          outputTokens: 0,
          breakdown: { input: 0, output: 0 },
        };
      }

      const providerSessionId = session.provider_session_id || sessionId;

      if (session.provider === 'cursor') {
        return {
          used: 0,
          total: 0,
          inputTokens: 0,
          outputTokens: 0,
          breakdown: { input: 0, output: 0 },
          unsupported: true,
          message: 'Token usage tracking not available for Cursor sessions',
        };
      }

      if (session.provider === 'opencode') {
        const databasePath = dependencies.getOpenCodeDatabasePath();
        if (!dependencies.fileExists(databasePath)) {
          throw new AppError('OpenCode database was not found.', {
            code: 'OPENCODE_DATABASE_NOT_FOUND',
            statusCode: 404,
          });
        }

        return readOpenCodeTokenUsage(databasePath, providerSessionId);
      }

      if (session.provider === 'codex') {
        const indexedFilePath = session.jsonl_path && dependencies.fileExists(session.jsonl_path)
          ? session.jsonl_path
          : null;
        const sessionFilePath = indexedFilePath ?? await findCodexSessionFile(
          path.join(dependencies.getHomeDirectory(), '.codex', 'sessions'),
          providerSessionId,
          dependencies,
        );

        if (!sessionFilePath) {
          throw new AppError(`Codex session file for "${sessionId}" was not found.`, {
            code: 'CODEX_SESSION_FILE_NOT_FOUND',
            statusCode: 404,
          });
        }

        const tail = await dependencies.readTextFileTail(sessionFilePath, TOKEN_USAGE_TAIL_BYTES);
        const tailUsage = findCodexTokenUsage(tail.content);
        if (tailUsage || tail.isComplete) {
          return tailUsage ?? emptyCodexTokenUsage();
        }

        // A tail this large with no token_count row is pathological, but the
        // whole file is still authoritative when it happens.
        return findCodexTokenUsage(await dependencies.readTextFile(sessionFilePath))
          ?? emptyCodexTokenUsage();
      }

      let sessionFilePath = session.jsonl_path;
      if (!sessionFilePath) {
        if (!session.project_path) {
          throw new AppError(`Session file for "${sessionId}" was not found.`, {
            code: 'SESSION_FILE_NOT_FOUND',
            statusCode: 404,
          });
        }

        const encodedProjectPath = session.project_path.replace(/[^a-zA-Z0-9-]/g, '-');
        const projectDirectory = path.join(
          dependencies.getHomeDirectory(),
          '.claude',
          'projects',
          encodedProjectPath,
        );
        sessionFilePath = path.join(projectDirectory, `${providerSessionId}.jsonl`);

        const relativePath = path.relative(path.resolve(projectDirectory), path.resolve(sessionFilePath));
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          throw new AppError('Resolved session path is invalid.', {
            code: 'INVALID_SESSION_PATH',
            statusCode: 400,
          });
        }
      }

      if (!dependencies.fileExists(sessionFilePath)) {
        throw new AppError(`Session file for "${sessionId}" was not found.`, {
          code: 'SESSION_FILE_NOT_FOUND',
          statusCode: 404,
        });
      }

      const tail = await dependencies.readTextFileTail(sessionFilePath, TOKEN_USAGE_TAIL_BYTES);
      let entries = parseClaudeUsageEntries(tail.content);
      if (!claudeEntriesHaveUsage(entries) && !tail.isComplete) {
        entries = parseClaudeUsageEntries(await dependencies.readTextFile(sessionFilePath));
      }
      return summarizeClaudeTokenUsage(entries, dependencies.getClaudeContextWindow());
    },
  };
}

/**
 * Used by the provider routes to serve token usage from only an app session id.
 */
export const providerTokenUsageService = createProviderTokenUsageService();
