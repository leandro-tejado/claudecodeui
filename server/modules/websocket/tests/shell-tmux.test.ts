import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { WebSocket } from 'ws';

import {
  buildShellCommand,
  handleShellConnection,
  nombreTmux,
} from '@/modules/websocket/services/shell-websocket.service.js';

const PROJECT_PATH = '/home/leantejado/worktrees/cloudcli/fase2-tmux';

function agentMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'init',
    projectPath: PROJECT_PATH,
    sessionId: 'b1e7c0de-1111-2222-3333-444455556666',
    hasSession: false,
    provider: 'claude',
    ...overrides,
  };
}

function tmuxPresent(overrides: Record<string, unknown> = {}) {
  return {
    resolveProviderSessionId: () => null,
    isTmuxAvailable: () => true,
    ...overrides,
  };
}

function createFakeSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    frames: string[];
    send: (data: string) => void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.frames = [];
  socket.send = (data: string) => socket.frames.push(data);
  return socket;
}

function createFakePty() {
  return {
    killed: false,
    onData() {
      return { dispose: () => undefined };
    },
    onExit() {
      return { dispose: () => undefined };
    },
    write() {},
    resize() {},
    kill() {
      this.killed = true;
    },
  };
}

// Kept first in the file on purpose: the "already warned" latch that keeps the
// fallback quiet lives at module scope, so only the first test to trip it can
// observe the single warning.
test('a missing tmux degrades to the bare command and warns exactly once', () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(' '));
  };

  let firstCommand: string;
  let secondCommand: string;
  try {
    const dependencies = tmuxPresent({ isTmuxAvailable: () => false });
    firstCommand = buildShellCommand(agentMessage(), dependencies);
    secondCommand = buildShellCommand(agentMessage(), dependencies);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(firstCommand, 'claude');
  assert.equal(secondCommand, 'claude');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /tmux not found in PATH/);
});

test('an agent command is wrapped in an attach-or-create tmux session', () => {
  const command = buildShellCommand(agentMessage(), tmuxPresent());

  assert.match(command, /^tmux new-session -A -s /);
  assert.ok(command.includes(nombreTmux(PROJECT_PATH, 'b1e7c0de-1111-2222-3333-444455556666')));
  assert.ok(command.includes(`-c '${PROJECT_PATH}'`));
  assert.ok(command.includes('claude'));
});

test('a resumed session keeps its --resume flag inside the tmux wrapper', () => {
  const command = buildShellCommand(
    agentMessage({ hasSession: true }),
    tmuxPresent({ resolveProviderSessionId: () => 'resumed-session-id' })
  );

  assert.match(command, /^tmux new-session -A -s /);
  assert.ok(command.includes('--resume'));
  assert.ok(command.includes('resumed-session-id'));
});

test('the session name is sanitized, capped at 40 chars and stable across calls', () => {
  const first = nombreTmux(PROJECT_PATH, 'b1e7c0de-1111-2222-3333-444455556666');
  const second = nombreTmux(PROJECT_PATH, 'b1e7c0de-1111-2222-3333-444455556666');

  assert.equal(first, second);
  assert.ok(first.length <= 40, `name too long: ${first} (${first.length})`);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
});

// `.` and `:` are what tmux itself uses to address windows and panes, so a
// name carrying them resolves to the wrong target instead of failing loudly.
test('dots and colons never reach the session name', () => {
  const name = nombreTmux('/srv/app.v2:staging/my project', 'sess.id:1');

  assert.ok(!name.includes('.'), `name kept a dot: ${name}`);
  assert.ok(!name.includes(':'), `name kept a colon: ${name}`);
  assert.match(name, /^[A-Za-z0-9_-]+$/);
});

test('two different sessions in one project get two different names', () => {
  const first = nombreTmux(PROJECT_PATH, 'session-one');
  const second = nombreTmux(PROJECT_PATH, 'session-two');

  assert.notEqual(first, second);
});

// Truncating a long path for readability must not be able to merge two
// distinct projects onto a single tmux session.
test('two long project paths sharing a prefix do not collide', () => {
  const base = '/home/leantejado/worktrees/un-directorio-con-un-nombre-larguisimo-de-verdad';
  const first = nombreTmux(`${base}-alfa`, 'same-session');
  const second = nombreTmux(`${base}-beta`, 'same-session');

  assert.notEqual(first, second);
  assert.ok(first.length <= 40);
  assert.ok(second.length <= 40);
});

test('login commands run unwrapped', () => {
  for (const loginCommand of ['claude setup-token', 'cursor-agent login', 'codex auth login']) {
    const command = buildShellCommand(
      agentMessage({ initialCommand: loginCommand, hasSession: true }),
      tmuxPresent()
    );

    assert.equal(command, loginCommand, `login command was wrapped: ${command}`);
    assert.ok(!command.includes('new-session'));
  }
});

test('a plain shell runs unwrapped', () => {
  const command = buildShellCommand(
    agentMessage({ provider: 'plain-shell', isPlainShell: true, initialCommand: 'htop' }),
    tmuxPresent()
  );

  assert.equal(command, 'htop');
  assert.ok(!command.includes('new-session'));
});

// The model id carries brackets, which bash expands as a glob. The wrapper
// puts the command through two shell parses (the pty's `bash -c` and tmux's
// own `$SHELL -c`), so a single layer of quoting is not enough.
test('brackets in the command survive both quoting layers', () => {
  const command = buildShellCommand(
    agentMessage({ initialCommand: "claude --model 'opus[1m]'", hasSession: true }),
    tmuxPresent()
  );

  assert.match(command, /^tmux new-session -A -s /);
  assert.ok(command.includes('opus[1m]'), `model id lost its brackets: ${command}`);
});

test('forceRestart kills the tmux session before the pty is respawned', () => {
  const killed: string[] = [];
  const order: string[] = [];
  const dependencies = tmuxPresent({
    killTmuxSession: (name: string) => {
      killed.push(name);
      order.push('kill');
    },
    spawnPty: () => {
      order.push('spawn');
      return createFakePty() as never;
    },
  });

  const socket = createFakeSocket();
  handleShellConnection(socket as never, dependencies);
  socket.emit('message', JSON.stringify(agentMessage({ forceRestart: true })));

  assert.deepEqual(killed, [nombreTmux(PROJECT_PATH, 'b1e7c0de-1111-2222-3333-444455556666')]);
  assert.deepEqual(order, ['kill', 'spawn']);
});

test('a normal init never kills the tmux session', () => {
  const killed: string[] = [];
  const dependencies = tmuxPresent({
    killTmuxSession: (name: string) => killed.push(name),
    spawnPty: () => createFakePty() as never,
  });

  const socket = createFakeSocket();
  handleShellConnection(socket as never, dependencies);
  socket.emit('message', JSON.stringify(agentMessage({ sessionId: 'no-restart-session' })));

  assert.deepEqual(killed, []);
});

test('forceRestart on a plain shell leaves tmux alone', () => {
  const killed: string[] = [];
  const dependencies = tmuxPresent({
    killTmuxSession: (name: string) => killed.push(name),
    spawnPty: () => createFakePty() as never,
  });

  const socket = createFakeSocket();
  handleShellConnection(socket as never, dependencies);
  socket.emit(
    'message',
    JSON.stringify(
      agentMessage({
        sessionId: 'plain-restart-session',
        provider: 'plain-shell',
        isPlainShell: true,
        initialCommand: 'htop',
        forceRestart: true,
      })
    )
  );

  assert.deepEqual(killed, []);
});

test('the pty is spawned with the wrapped command', () => {
  const spawnedCommands: string[] = [];
  const dependencies = tmuxPresent({
    spawnPty: (_shell: string, args: string | string[]) => {
      spawnedCommands.push(Array.isArray(args) ? args[args.length - 1] : args);
      return createFakePty() as never;
    },
  });

  const socket = createFakeSocket();
  handleShellConnection(socket as never, dependencies);
  socket.emit('message', JSON.stringify(agentMessage({ sessionId: 'spawned-session' })));

  assert.equal(spawnedCommands.length, 1);
  assert.match(spawnedCommands[0], /^tmux new-session -A -s /);
});
