import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';
import { CLAUDE_PREDEFINED_MODELS } from '@/modules/providers/list/claude/claude-models.provider.js';
import {
  queryClaudeSDK,
  resolveToolApproval,
} from '@/modules/providers/list/claude/claude-runtime.provider.js';
import type { NormalizedMessage, ProviderRuntimeContext } from '@/shared/types.js';

/**
 * Fase 9, paso 1: en 'auto' y 'bypassPermissions' la SDK resuelve el permiso
 * en el paso de modo y nunca llama a `canUseTool`, así que AskUserQuestion se
 * contestaba solo (línea base rota). El fix es un hook `PreToolUse` con
 * matcher 'AskUserQuestion' que corre *antes* de ese paso y, al devolver una
 * decisión explícita, lo saltea en cualquier modo.
 *
 * Estas pruebas no levantan un CLI real: usan el mismo seam que
 * claude-runtime-hold.test.ts (`context.createQuery`), pero en vez de solo
 * leer el prompt, capturan `options` para invocar el hook registrado
 * directamente — así se prueba la lógica del hook sin tocar el proceso de
 * `claude` ni la cuota.
 */

const SESSION_ID = 'app-ask-hook-session';
const NATIVE_ID = 'native-ask-hook-session';

type CapturedQuery = {
  createQuery: NonNullable<ProviderRuntimeContext['createQuery']>;
  options: () => Record<string, unknown> | null;
  end: () => void;
};

function createCapturingQuery(): CapturedQuery {
  let capturedOptions: Record<string, unknown> | null = null;
  const queue: Array<Record<string, unknown> | null> = [];
  let wake: (() => void) | null = null;

  const createQuery: NonNullable<ProviderRuntimeContext['createQuery']> = ({ prompt, options }) => {
    capturedOptions = options as Record<string, unknown>;
    void (async () => {
      for await (const _message of prompt) { /* read stdin so the stream can close */ }
    })();

    const iterator = (async function* () {
      for (;;) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => { wake = resolve; });
          wake = null;
          continue;
        }
        const next = queue.shift();
        if (next === null || next === undefined) return;
        yield next;
      }
    })();

    return Object.assign(iterator, {
      interrupt: async () => {},
      stopTask: async () => {},
    });
  };

  return {
    createQuery,
    options: () => capturedOptions,
    end: () => { queue.push(null); wake?.(); },
  };
}

async function withCapturedHooks(
  permissionMode: string,
  runTest: (context: { sent: NormalizedMessage[]; hooks: Record<string, unknown>; end: () => void }) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'claude-ask-hook-'));
  const { createQuery, options, end } = createCapturingQuery();
  const sent: NormalizedMessage[] = [];
  const writer = { send: (message: NormalizedMessage) => { sent.push(message); }, userId: null };
  const sessions = new ClaudeSessionsProvider({ getLiveRunStartTime: () => null });
  const context: ProviderRuntimeContext = {
    resolveProviderSessionId: () => null,
    resolveResumeModel: async () => undefined,
    getProviderModels: async () => CLAUDE_PREDEFINED_MODELS as never,
    normalizeMessage: (raw, sessionId) => sessions.normalizeMessage(raw, sessionId),
    isProviderInstalled: async () => true,
    createQuery,
  };

  try {
    const done = queryClaudeSDK('hello', { sessionId: SESSION_ID, cwd, permissionMode }, writer as never, context);
    // Let queryClaudeSDK reach createQuery and register the hooks. A fixed
    // tick count races the event loop under load (see the note in
    // claude-runtime-hold.test.ts), so poll with a generous ceiling instead.
    let resolvedOptions: Record<string, unknown> | null = null;
    for (let i = 0; i < 2000 && !resolvedOptions; i += 1) {
      await new Promise((resolve) => { setImmediate(resolve); });
      resolvedOptions = options();
    }
    assert.ok(resolvedOptions, 'createQuery should have been called with options');
    const hooks = resolvedOptions!.hooks as Record<string, unknown>;
    assert.ok(hooks, 'sdkOptions.hooks should be set');
    await runTest({ sent, hooks, end });
    end();
    await done;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function getAskUserQuestionHook(hooks: Record<string, unknown>) {
  const preToolUse = hooks.PreToolUse as Array<{ matcher: string; hooks: Array<(...a: unknown[]) => unknown> }>;
  assert.ok(Array.isArray(preToolUse), 'PreToolUse hooks array should exist');
  const entry = preToolUse.find((e) => e.matcher === 'AskUserQuestion');
  assert.ok(entry, 'a PreToolUse entry matching AskUserQuestion should be registered');
  const [hookFn] = entry!.hooks;
  assert.equal(typeof hookFn, 'function');
  return hookFn as (
    input: { tool_name: string; tool_input: unknown; tool_use_id: string },
    toolUseId: string,
    options: { signal?: AbortSignal },
  ) => Promise<Record<string, unknown>>;
}

for (const mode of ['auto', 'bypassPermissions', 'default']) {
  test(`PreToolUse hook for AskUserQuestion waits for the UI answer in '${mode}' mode`, async () => {
    await withCapturedHooks(mode, async ({ sent, hooks }) => {
      const hookFn = getAskUserQuestionHook(hooks);
      const toolUseId = `toolu_ask_${mode}`;
      const toolInput = {
        questions: [{ question: '¿A, B o C?', options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] }],
      };

      const pending = hookFn(
        { tool_name: 'AskUserQuestion', tool_input: toolInput, tool_use_id: toolUseId },
        toolUseId,
        {},
      );

      // It must not resolve on its own: the whole point of the fix is that
      // 'auto'/'bypassPermissions' no longer auto-answer this tool.
      let settledEarly = false;
      pending.then(() => { settledEarly = true; });
      for (let i = 0; i < 10; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
      assert.equal(settledEarly, false, `the hook resolved on its own in '${mode}' mode without a UI answer`);

      // The UI saw a permission_request carrying the tool_use_id as requestId.
      const request = sent.find((m) => m.kind === 'permission_request');
      assert.ok(request, 'a permission_request should have been sent to the UI');
      assert.equal((request as unknown as { requestId: string }).requestId, toolUseId);
      assert.equal((request as unknown as { toolName: string }).toolName, 'AskUserQuestion');

      // The UI answers with the folded-in structured answers.
      const updatedInput = { ...toolInput, answers: { '¿A, B o C?': 'B' } };
      resolveToolApproval(toolUseId, { allow: true, updatedInput });

      const outcome = await pending;
      const hookSpecificOutput = outcome.hookSpecificOutput as Record<string, unknown>;
      assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
      assert.equal(hookSpecificOutput.permissionDecision, 'allow');
      assert.deepEqual(hookSpecificOutput.updatedInput, updatedInput);

      // Resolving must retract the prompt for any other attached tab/replay.
      assert.ok(sent.some((m) => m.kind === 'permission_resolved' && (m as unknown as { requestId: string }).requestId === toolUseId));
    });
  });
}

test('PreToolUse hook for AskUserQuestion denies when the UI denies it', async () => {
  await withCapturedHooks('bypassPermissions', async ({ hooks }) => {
    const hookFn = getAskUserQuestionHook(hooks);
    const toolUseId = 'toolu_ask_deny';
    const pending = hookFn(
      { tool_name: 'AskUserQuestion', tool_input: { questions: [] }, tool_use_id: toolUseId },
      toolUseId,
      {},
    );
    resolveToolApproval(toolUseId, { allow: false, message: 'User denied tool use' });
    const outcome = await pending;
    const hookSpecificOutput = outcome.hookSpecificOutput as Record<string, unknown>;
    assert.equal(hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(hookSpecificOutput.permissionDecisionReason, 'User denied tool use');
  });
});
