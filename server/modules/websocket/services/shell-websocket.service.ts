import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import pty, { type IPty } from 'node-pty';
import { WebSocket, type RawData } from 'ws';

import { parseIncomingJsonObject } from '@/shared/utils.js';

type ShellIncomingMessage = {
  type?: string;
  data?: string;
  cols?: number;
  rows?: number;
  projectPath?: string;
  sessionId?: string;
  hasSession?: boolean;
  provider?: string;
  initialCommand?: string;
  isPlainShell?: boolean;
  forceRestart?: boolean;
  bypassPermissions?: boolean;
};

type PtySessionEntry = {
  pty: IPty;
  ws: WebSocket | null;
  buffer: string[];
  timeoutId: NodeJS.Timeout | null;
  projectPath: string;
  sessionId: string | null;
};

const ptySessionsMap = new Map<string, PtySessionEntry>();
const PTY_SESSION_TIMEOUT = 30 * 60 * 1000;
const SHELL_URL_PARSE_BUFFER_LIMIT = 32768;
const ANSI_ESCAPE_SEQUENCE_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;
const TRAILING_URL_PUNCTUATION_REGEX = /[)\]}>.,;:!?]+$/;

function stripAnsiSequences(value: string): string {
  return value.replace(ANSI_ESCAPE_SEQUENCE_REGEX, '');
}

function normalizeDetectedUrl(url: string): string | null {
  const cleanedUrl = url.trim().replace(TRAILING_URL_PUNCTUATION_REGEX, '');
  if (!cleanedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(cleanedUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function extractUrlsFromText(value: string): string[] {
  const directMatches = value.match(/https?:\/\/[^\s<>"'`\\\x1b\x07]+/gi) ?? [];

  // Terminal width can split a URL across lines, so valid URL characters on
  // immediately following lines are joined before the URL is validated.
  const wrappedMatches: string[] = [];
  const urlContinuationPattern = /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;
  const lines = value.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    const startMatch = line.match(/https?:\/\/[^\s<>"'`\\\x1b\x07]+/i);
    if (!startMatch) {
      continue;
    }

    let combinedUrl = startMatch[0];
    let continuationIndex = lineIndex + 1;
    while (continuationIndex < lines.length) {
      const continuation = lines[continuationIndex].trim();
      if (!continuation || !urlContinuationPattern.test(continuation)) {
        break;
      }
      combinedUrl += continuation;
      continuationIndex += 1;
    }

    wrappedMatches.push(combinedUrl);
  }

  return Array.from(new Set([...directMatches, ...wrappedMatches]));
}

function shouldAutoOpenUrlFromOutput(value: string): boolean {
  const normalizedOutput = value.toLowerCase();
  return (
    normalizedOutput.includes("browser didn't open") ||
    normalizedOutput.includes('open this url') ||
    normalizedOutput.includes('continue in your browser') ||
    normalizedOutput.includes('press enter to open') ||
    normalizedOutput.includes('open_url:')
  );
}

type ShellWebSocketDependencies = {
  resolveProviderSessionId: (
    sessionId: string,
    provider: string,
  ) => string | null | undefined;
  spawnPty?: typeof pty.spawn;
  /** Overridable for tests; real default probes the PATH for a `tmux` binary. */
  isTmuxAvailable?: () => boolean;
  /** Overridable for tests; real default shells out to `tmux kill-session`. */
  killTmuxSession?: (nombre: string) => void;
};

/**
 * Reads a string field from untyped payloads and falls back when absent.
 */
function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Reads a boolean field from untyped payloads and falls back when absent.
 */
function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Reads a finite number field from untyped payloads and falls back when absent.
 */
function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Parses incoming websocket shell messages and keeps processing safe when
 * malformed payloads are received.
 */
function parseShellMessage(rawMessage: RawData): ShellIncomingMessage | null {
  const payload = parseIncomingJsonObject(rawMessage);
  if (!payload) {
    return null;
  }

  return payload as ShellIncomingMessage;
}

const SAFE_SESSION_ID_PATTERN = /^[a-zA-Z0-9_.\-:]+$/;

function resolveResumeSessionId(
  message: ShellIncomingMessage,
  dependencies: ShellWebSocketDependencies
): string {
  const hasSession = readBoolean(message.hasSession);
  const sessionId = readString(message.sessionId);
  const provider = readString(message.provider, 'claude');

  if (!hasSession || !sessionId) {
    return '';
  }

  let resumeSessionId: string | null | undefined;
  try {
    resumeSessionId = dependencies.resolveProviderSessionId(sessionId, provider);
  } catch (error) {
    console.error('Failed to resolve provider session ID:', error);
    resumeSessionId = undefined;
  }

  const resolvedSessionId = resumeSessionId === undefined ? sessionId : resumeSessionId;
  if (!resolvedSessionId || !SAFE_SESSION_ID_PATTERN.test(resolvedSessionId)) {
    return '';
  }

  return resolvedSessionId;
}

const TMUX_SESSION_NAME_MAX_LENGTH = 40;
const TMUX_SESSION_NAME_UNSAFE_CHARS_REGEX = /[^A-Za-z0-9_-]+/g;
const TMUX_SESSION_NAME_HASH_LENGTH = 8;
const TMUX_SESSION_NAME_PREFIX = 'cloudcli-';

/**
 * Deterministic tmux session name for a project + session pair: two `init`
 * calls for the same pair must resolve to the same name so `new-session -A`
 * (attach-or-create) reattaches instead of minting a sibling session. Built
 * from a sanitized, truncated slice of the project path (for readability in
 * `tmux ls`) plus a stable hash of the full key (so truncation never causes
 * two different sessions to collide on the same name).
 */
export function nombreTmux(projectPath: string, sessionId: string | null): string {
  const key = `${projectPath}::${sessionId ?? 'default'}`;
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, TMUX_SESSION_NAME_HASH_LENGTH);
  const readableSeed = path.basename(projectPath) || 'proj';
  const sanitizedReadable = readableSeed.replace(TMUX_SESSION_NAME_UNSAFE_CHARS_REGEX, '-');
  const readableBudget = Math.max(
    TMUX_SESSION_NAME_MAX_LENGTH - TMUX_SESSION_NAME_PREFIX.length - TMUX_SESSION_NAME_HASH_LENGTH - 1,
    0
  );
  const readablePart = sanitizedReadable.slice(0, readableBudget);
  return `${TMUX_SESSION_NAME_PREFIX}${readablePart}-${hash}`.slice(0, TMUX_SESSION_NAME_MAX_LENGTH);
}

const TMUX_LOGIN_COMMAND_MARKERS = ['setup-token', 'cursor-agent login', 'auth login'];

/**
 * Login flows print their own prompt/URL directly to the pty and must run
 * unwrapped: a detached tmux pane is the wrong place to ask for a browser
 * click, and the caller (handleShellConnection) already restarts the PTY
 * from scratch on these regardless of tmux.
 */
function isLoginCommand(initialCommand: string): boolean {
  return !!initialCommand && TMUX_LOGIN_COMMAND_MARKERS.some((marker) => initialCommand.includes(marker));
}

/**
 * POSIX single-quote escaping: close the quote, emit a literal quote via a
 * backslash outside of any quoting, then reopen. Used twice when wrapping in
 * tmux (see wrapInTmuxSession) because the composed line goes through two
 * real shell parses (the pty's `bash -c` and tmux's own internal `$SHELL -c`)
 * before the final process starts, and each parse must hand the next one
 * back the exact original text.
 */
function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function checkTmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let tmuxMissingLogged = false;

/**
 * Wraps an agent command line so it runs inside a named, attach-or-create
 * tmux session instead of directly under the pty's `bash -c`. This is the
 * piece that lets a long session survive a `systemctl restart cloudcli`: the
 * tmux server (and the pane's process) lives outside CloudCLI's own process
 * tree.
 *
 * Token resolution (the delicate part): the VPS token lives in `~/.bashrc`
 * and is only exported by an INTERACTIVE bash. CloudCLI's own pty already
 * runs `bash -c` (non-interactive), and if the tmux *server* was started
 * earlier by ttyd (whose systemd unit doesn't read the EnvironmentFile
 * either — see `~/CLAUDE.md`), a brand new session on that same server can
 * inherit an environment with no token at all. `.claude/bin/claude-tmux`
 * (`ct`) already solved this with `bash -ic`, which sources `.bashrc`
 * regardless of what the tmux server's environment looked like — so the pane
 * re-exports the token itself. Reusing that exact recipe here is simpler and
 * safer than teaching this service where the systemd EnvironmentFile lives
 * (that would mean reading a credential path, which crosses REGLA 5).
 */
function wrapInTmuxSession(
  command: string,
  message: ShellIncomingMessage,
  dependencies: ShellWebSocketDependencies
): string {
  const isTmuxAvailable = dependencies.isTmuxAvailable ?? checkTmuxAvailable;
  if (!isTmuxAvailable()) {
    if (!tmuxMissingLogged) {
      tmuxMissingLogged = true;
      console.warn(
        '[WARN] tmux not found in PATH; falling back to a plain shell process (the session will NOT survive a service restart)'
      );
    }
    return command;
  }

  const projectPath = readString(message.projectPath, process.cwd());
  const resolvedCwd = path.resolve(projectPath);
  const sessionId = readString(message.sessionId) || null;
  const nombre = nombreTmux(projectPath, sessionId);

  const innerShell = `bash -ic ${quoteForShell(command)}`;
  return `tmux new-session -A -s ${nombre} -c ${quoteForShell(resolvedCwd)} ${quoteForShell(innerShell)}`;
}

/**
 * Best-effort: kills the tmux session backing a forced restart before a new
 * PTY is spawned, so `forceRestart` truly restarts the agent instead of
 * reattaching (`-A`) to the still-running old one. Silently no-ops when tmux
 * is unavailable or the session doesn't exist — there is nothing to restart.
 */
function killTmuxSessionIfExists(nombre: string, dependencies: ShellWebSocketDependencies): void {
  const isTmuxAvailable = dependencies.isTmuxAvailable ?? checkTmuxAvailable;
  if (!isTmuxAvailable()) {
    return;
  }

  const kill = dependencies.killTmuxSession ?? ((sessionName: string) => {
    try {
      execFileSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });
    } catch {
      // No session with that name — nothing to restart.
    }
  });

  kill(nombre);
}

/**
 * Resolves provider command line for plain shell and agent-backed shell modes.
 */
export function buildShellCommand(
  message: ShellIncomingMessage,
  dependencies: ShellWebSocketDependencies
): string {
  const hasSession = readBoolean(message.hasSession);
  const initialCommand = readString(message.initialCommand);
  const provider = readString(message.provider, 'claude');
  const resumeSessionId = resolveResumeSessionId(message, dependencies);
  const isPlainShell =
    readBoolean(message.isPlainShell) ||
    (!!initialCommand && !hasSession) ||
    provider === 'plain-shell';

  if (isPlainShell) {
    return initialCommand;
  }

  let command: string;

  if (provider === 'cursor') {
    command = resumeSessionId ? `cursor-agent --resume="${resumeSessionId}"` : 'cursor-agent';
  } else if (provider === 'codex') {
    if (resumeSessionId) {
      command =
        os.platform() === 'win32'
          ? `codex resume "${resumeSessionId}"; if ($LASTEXITCODE -ne 0) { codex }`
          : `codex resume "${resumeSessionId}" || codex`;
    } else {
      command = 'codex';
    }
  } else if (provider === 'opencode') {
    command = resumeSessionId ? `opencode --session "${resumeSessionId}"` : initialCommand || 'opencode';
  } else {
    // Launching with the flag is what unlocks "bypass permissions" in the CLI's
    // shift+tab permission-mode cycle; it cannot be enabled from inside a
    // session started without it.
    const bypassFlag = readBoolean(message.bypassPermissions) ? ' --dangerously-skip-permissions' : '';
    const claudeCommand = initialCommand || `claude${bypassFlag}`;
    if (resumeSessionId) {
      command =
        os.platform() === 'win32'
          ? `claude --resume "${resumeSessionId}"${bypassFlag}; if ($LASTEXITCODE -ne 0) { claude${bypassFlag} }`
          : `claude --resume "${resumeSessionId}"${bypassFlag} || claude${bypassFlag}`;
    } else {
      command = claudeCommand;
    }
  }

  // tmux wrapping is POSIX-only (single-quote escaping + `bash -ic`); on
  // win32 there is no tmux and the command above is already PowerShell
  // syntax, so it is returned unwrapped regardless of what tmux detection
  // would say.
  if (os.platform() === 'win32' || isLoginCommand(initialCommand)) {
    return command;
  }

  return wrapInTmuxSession(command, message, dependencies);
}

function readEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const resolvedKey = Object.keys(env).find((envKey) => envKey.toLowerCase() === key.toLowerCase());
  return resolvedKey ? env[resolvedKey] : undefined;
}

function getPathEnvKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
}

function prioritizeUserNpmGlobalBin(env: NodeJS.ProcessEnv): { key: string; value: string | undefined } {
  const pathKey = getPathEnvKey(env);
  const currentPath = env[pathKey];
  if (!currentPath) {
    return { key: pathKey, value: currentPath };
  }

  const delimiter = path.delimiter;
  const pathEntries = currentPath.split(delimiter).filter(Boolean);
  const npmPrefix = readEnvValue(env, 'npm_config_prefix');
  const appData = readEnvValue(env, 'APPDATA');
  const candidates = [
    npmPrefix || '',
    npmPrefix ? path.join(npmPrefix, 'bin') : '',
    appData ? path.join(appData, 'npm') : '',
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    path.join(os.homedir(), '.npm-global', 'bin'),
  ].filter(Boolean);

  const normalizedPathEntries = pathEntries.map((entry) => os.platform() === 'win32' ? entry.toLowerCase() : entry);
  const preferredEntries = candidates.filter((candidate, index) => {
    const normalizedCandidate = os.platform() === 'win32' ? candidate.toLowerCase() : candidate;
    return (
      candidates.indexOf(candidate) === index &&
      normalizedPathEntries.includes(normalizedCandidate)
    );
  });

  if (preferredEntries.length === 0) {
    return { key: pathKey, value: currentPath };
  }

  const normalizedPreferredEntries = preferredEntries.map((entry) =>
    os.platform() === 'win32' ? entry.toLowerCase() : entry
  );

  const value = [
    ...preferredEntries,
    ...pathEntries.filter((entry) => {
      const normalizedEntry = os.platform() === 'win32' ? entry.toLowerCase() : entry;
      return !normalizedPreferredEntries.includes(normalizedEntry);
    }),
  ].join(delimiter);

  return { key: pathKey, value };
}

/**
 * Used by this module's websocket gateway to connect the standalone Shell UI
 * to a retained PTY while keeping process lifecycle ownership on the server.
 */
export function handleShellConnection(
  ws: WebSocket,
  dependencies: ShellWebSocketDependencies
): void {
  console.log('[INFO] Shell websocket connected');

  let shellProcess: IPty | null = null;
  let ptySessionKey: string | null = null;
  let urlDetectionBuffer = '';
  const announcedAuthUrls = new Set<string>();

  ws.on('message', async (rawMessage) => {
    try {
      const data = parseShellMessage(rawMessage);
      if (!data?.type) {
        throw new Error('Invalid websocket payload');
      }

      if (data.type === 'init') {
        const projectPath = readString(data.projectPath, process.cwd());
        const sessionId = readString(data.sessionId) || null;
        const hasSession = readBoolean(data.hasSession);
        const provider = readString(data.provider, 'claude');
        const initialCommand = readString(data.initialCommand);
        const forceRestart = readBoolean(data.forceRestart);
        const isPlainShell =
          readBoolean(data.isPlainShell) ||
          (!!initialCommand && !hasSession) ||
          provider === 'plain-shell';

        urlDetectionBuffer = '';
        announcedAuthUrls.clear();

        const isLoginCmd = isLoginCommand(initialCommand);

        const commandSuffix =
          isPlainShell && initialCommand
            ? `_cmd_${Buffer.from(initialCommand).toString('base64').slice(0, 16)}`
            : '';
        ptySessionKey = `${projectPath}_${sessionId ?? 'default'}${commandSuffix}`;

        if (isLoginCmd || forceRestart) {
          const oldSession = ptySessionsMap.get(ptySessionKey);
          if (oldSession) {
            if (oldSession.timeoutId) {
              clearTimeout(oldSession.timeoutId);
            }
            oldSession.pty.kill();
            ptySessionsMap.delete(ptySessionKey);
          }

          // The local pty above is just CloudCLI's handle on the session; the
          // tmux server (and the pane's process) survives independently of
          // it. A forced restart has to kill the tmux session itself too, or
          // `-A` would just reattach to the still-running old one.
          if (forceRestart && !isPlainShell && !isLoginCmd) {
            killTmuxSessionIfExists(nombreTmux(projectPath, sessionId), dependencies);
          }
        }

        const existingSession =
          isLoginCmd || forceRestart ? null : ptySessionsMap.get(ptySessionKey);
        if (existingSession) {
          shellProcess = existingSession.pty;
          if (existingSession.timeoutId) {
            clearTimeout(existingSession.timeoutId);
            existingSession.timeoutId = null;
          }

          ws.send(
            JSON.stringify({
              type: 'output',
              data: '\x1b[36m[Reconnected to existing session]\x1b[0m\r\n',
            })
          );

          if (existingSession.buffer.length > 0) {
            existingSession.buffer.forEach((bufferedData) => {
              ws.send(
                JSON.stringify({
                  type: 'output',
                  data: bufferedData,
                })
              );
            });
          }

          existingSession.ws = ws;
          return;
        }

        const resolvedProjectPath = path.resolve(projectPath);
        try {
          const stats = fs.statSync(resolvedProjectPath);
          if (!stats.isDirectory()) {
            throw new Error('Not a directory');
          }
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid project path' }));
          return;
        }

        const safeSessionIdPattern = /^[a-zA-Z0-9_.\-:]+$/;
        if (sessionId && !safeSessionIdPattern.test(sessionId)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid session ID' }));
          return;
        }

        const shellCommand = buildShellCommand(data, dependencies);
        const resumeSessionId = resolveResumeSessionId(data, dependencies);
        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        const shellArgs =
          os.platform() === 'win32' ? ['-Command', shellCommand] : ['-c', shellCommand];
        const termCols = readNumber(data.cols, 80);
        const termRows = readNumber(data.rows, 24);
        const prioritizedPath = prioritizeUserNpmGlobalBin(process.env);

        shellProcess = (dependencies.spawnPty ?? pty.spawn)(shell, shellArgs, {
          name: 'xterm-256color',
          cols: termCols,
          rows: termRows,
          cwd: resolvedProjectPath,
          env: {
            ...process.env,
            [prioritizedPath.key]: prioritizedPath.value,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            FORCE_COLOR: '3',
          },
        });

        ptySessionsMap.set(ptySessionKey, {
          pty: shellProcess,
          ws,
          buffer: [],
          timeoutId: null,
          projectPath,
          sessionId,
        });

        shellProcess.onData((chunk) => {
          if (!ptySessionKey) {
            return;
          }

          const session = ptySessionsMap.get(ptySessionKey);
          if (!session) {
            return;
          }

          if (session.buffer.length < 5000) {
            session.buffer.push(chunk);
          } else {
            session.buffer.shift();
            session.buffer.push(chunk);
          }

          if (session.ws && session.ws.readyState === WebSocket.OPEN) {
            let outputData = chunk;
            const cleanChunk = stripAnsiSequences(chunk);
            urlDetectionBuffer = `${urlDetectionBuffer}${cleanChunk}`.slice(-SHELL_URL_PARSE_BUFFER_LIMIT);

            outputData = outputData.replace(
              /OPEN_URL:\s*(https?:\/\/[^\s\x1b\x07]+)/g,
              '[INFO] Opening in browser: $1'
            );

            const emitAuthUrl = (detectedUrl: string, autoOpen = false) => {
              const normalizedUrl = normalizeDetectedUrl(detectedUrl);
              if (!normalizedUrl) {
                return;
              }

              const isNewUrl = !announcedAuthUrls.has(normalizedUrl);
              if (isNewUrl) {
                announcedAuthUrls.add(normalizedUrl);
                session.ws?.send(
                  JSON.stringify({
                    type: 'auth_url',
                    url: normalizedUrl,
                    autoOpen,
                  })
                );
              }
            };

            const normalizedDetectedUrls = extractUrlsFromText(urlDetectionBuffer)
              .map((url) => normalizeDetectedUrl(url))
              .filter((url): url is string => Boolean(url));

            const dedupedDetectedUrls = Array.from(new Set(normalizedDetectedUrls)).filter(
              (url, _, urls) =>
                !urls.some((otherUrl) => otherUrl !== url && otherUrl.startsWith(url))
            );

            dedupedDetectedUrls.forEach((url) => emitAuthUrl(url, false));

            if (
              shouldAutoOpenUrlFromOutput(cleanChunk) &&
              dedupedDetectedUrls.length > 0
            ) {
              const bestUrl = dedupedDetectedUrls.reduce((longest, current) =>
                current.length > longest.length ? current : longest
              );
              emitAuthUrl(bestUrl, true);
            }

            session.ws.send(
              JSON.stringify({
                type: 'output',
                data: outputData,
              })
            );
          }
        });

        shellProcess.onExit((exitCode) => {
          if (!ptySessionKey) {
            return;
          }

          const session = ptySessionsMap.get(ptySessionKey);
          if (session && session.pty !== shellProcess) {
            return;
          }

          if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(
              JSON.stringify({
                type: 'output',
                data: `\r\n\x1b[33mProcess exited with code ${exitCode.exitCode}${
                  exitCode.signal != null ? ` (${exitCode.signal})` : ''
                }\x1b[0m\r\n`,
              })
            );
          }

          if (session?.timeoutId) {
            clearTimeout(session.timeoutId);
          }

          ptySessionsMap.delete(ptySessionKey);
          shellProcess = null;
        });

        let welcomeMsg = `\x1b[36mStarting terminal in: ${projectPath}\x1b[0m\r\n`;
        if (!isPlainShell) {
          const providerName =
            provider === 'cursor'
              ? 'Cursor'
              : provider === 'codex'
                ? 'Codex'
                : provider === 'opencode'
                    ? 'OpenCode'
                  : 'Claude';
          welcomeMsg = hasSession && resumeSessionId
            ? `\x1b[36mResuming ${providerName} session ${resumeSessionId} in: ${projectPath}\x1b[0m\r\n`
            : `\x1b[36mStarting new ${providerName} session in: ${projectPath}\x1b[0m\r\n`;
        }

        ws.send(
          JSON.stringify({
            type: 'output',
            data: welcomeMsg,
          })
        );
        return;
      }

      if (data.type === 'input') {
        if (shellProcess) {
          shellProcess.write(readString(data.data));
        }
        return;
      }

      if (data.type === 'resize') {
        if (shellProcess) {
          shellProcess.resize(readNumber(data.cols, 80), readNumber(data.rows, 24));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[ERROR] Shell WebSocket error:', message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'output',
            data: `\r\n\x1b[31mError: ${message}\x1b[0m\r\n`,
          })
        );
      }
    }
  });

  ws.on('close', () => {
    if (!ptySessionKey) {
      return;
    }

    const session = ptySessionsMap.get(ptySessionKey);
    if (!session) {
      return;
    }

    // Mobile networks can deliver an old socket's close after its replacement
    // has attached. Only the socket that currently owns the PTY may detach it.
    if (session.ws !== ws) {
      return;
    }

    session.ws = null;
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    session.timeoutId = setTimeout(() => {
      // A reconnect may win just as this timer becomes runnable. Re-check the
      // active socket so a queued cleanup can never kill a reattached PTY.
      if (ptySessionsMap.get(ptySessionKey as string) !== session || session.ws !== null) {
        return;
      }

      session.pty.kill();
      ptySessionsMap.delete(ptySessionKey as string);
    }, PTY_SESSION_TIMEOUT);
  });

  ws.on('error', (error) => {
    console.error('[ERROR] Shell WebSocket error:', error);
  });
}
