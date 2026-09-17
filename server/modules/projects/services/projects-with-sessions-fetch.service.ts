import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { projectsDb, sessionsDb } from '@/modules/database/index.js';
import { sessionSynchronizerService } from '@/modules/providers/index.js';
import { WS_OPEN_STATE, connectedClients, nombreTmux } from '@/modules/websocket/index.js';
import type { RealtimeClientConnection } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

/** Derived, not authoritative — see `deriveSubagentModelAndStatus`. */
type SubagentStatus = 'running' | 'completed' | 'failed';

/** One entry for the sidebar's subagent popover: what a `agent-*.meta.json` plus a tail read of its transcript can tell without loading the whole file. */
export type SessionSubagentSummary = {
  id: string;
  type: string;
  description: string;
  model: string | null;
  status: SubagentStatus;
  /** ISO instant the meta file was written — a proxy for spawn time, used as the timestamp fallback when jumping to this subagent's card in chat. */
  startedAt: string | null;
};

/** `null` cuando el registro de `sesiones.py` no tiene esta sesión — ausente, no una sesión sin tmux. */
export type SessionTmuxInfo = { nombre: string; vivo: boolean } | null;

type SessionSummary = {
  id: string;
  provider: string;
  summary: string;
  messageCount: number;
  lastActivity: string;
  /** Count of `agent-*.meta.json` files under the session's `subagents/` dir — 0 when the dir does not exist. Acumulado: never drops when a run finishes. */
  subagentCount: number;
  /** Empty when `subagentCount` is 0 — no extra I/O beyond the one `readdir`. */
  subagents: SessionSubagentSummary[];
  tmux: SessionTmuxInfo;
};

type SessionRepositoryRow = {
  provider: string;
  session_id: string;
  custom_name?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  jsonl_path?: string | null;
};

export type ProjectListItem = {
  projectId: string;
  path: string;
  displayName: string;
  fullPath: string;
  isStarred: boolean;
  sessions: SessionSummary[];
  sessionMeta: {
    hasMore: boolean;
    total: number;
  };
};

export type ArchivedProjectListItem = ProjectListItem & {
  isArchived: true;
};

type ProgressUpdate = {
  phase: 'loading' | 'complete';
  current: number;
  total: number;
  currentProject?: string;
};

type GetProjectsWithSessionsOptions = {
  skipSynchronization?: boolean;
  sessionsLimit?: number;
  sessionsOffset?: number;
};

type SessionPaginationOptions = {
  limit?: number;
  offset?: number;
};

type ProjectSessionsPageResult = {
  sessions: SessionSummary[];
  total: number;
  hasMore: boolean;
};

export type ProjectSessionsPageApiView = {
  projectId: string;
  sessions: SessionSummary[];
  sessionMeta: {
    hasMore: boolean;
    total: number;
  };
};

const DEFAULT_PROJECT_SESSIONS_PAGE_SIZE = 20;
const MAX_PROJECT_SESSIONS_PAGE_SIZE = 200;

/**
 * Generate better display name from path.
 */
export async function generateDisplayName(projectName: string, actualProjectDir: string | null = null): Promise<string> {
  // Use actual project directory if provided, otherwise decode from project name.
  const projectPath = actualProjectDir || projectName.replace(/-/g, '/');

  // Try to read package.json from the project path.
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData) as { name?: string };

    // Return the name from package.json if it exists.
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch {
    // Fall back to path-based naming if package.json doesn't exist or can't be read.
  }

  // If it starts with /, it's an absolute path.
  if (projectPath.startsWith('/')) {
    const parts = projectPath.split('/').filter(Boolean);
    // Return only the last folder name.
    return parts[parts.length - 1] || projectPath;
  }

  return projectPath;
}

function normalizeSessionPagination(options: SessionPaginationOptions = {}): { limit: number; offset: number } {
  const rawLimit = Number.isFinite(options.limit) ? Math.floor(Number(options.limit)) : DEFAULT_PROJECT_SESSIONS_PAGE_SIZE;
  const rawOffset = Number.isFinite(options.offset) ? Math.floor(Number(options.offset)) : 0;

  return {
    limit: Math.min(Math.max(1, rawLimit), MAX_PROJECT_SESSIONS_PAGE_SIZE),
    offset: Math.max(0, rawOffset),
  };
}

/** `<jsonl path without extension>/subagents` — where Claude writes one `agent-<id>.jsonl` + `.meta.json` pair per spawned subagent. `null` for a session with no transcript yet (an app-created row before the first provider write). */
function deriveSubagentsDirectory(jsonlPath: string | null | undefined): string | null {
  if (!jsonlPath) return null;
  const withoutExtension = jsonlPath.endsWith('.jsonl') ? jsonlPath.slice(0, -'.jsonl'.length) : jsonlPath;
  return path.join(withoutExtension, 'subagents');
}

const SUBAGENT_META_FILE_PATTERN = /^agent-(.+)\.meta\.json$/;

/** Bytes read from the tail of a subagent transcript to guess its model/status. Bounded on purpose: a heavy fan-out can leave a multi-megabyte transcript, and this only runs for sessions that actually spawned subagents. */
const SUBAGENT_TAIL_READ_BYTES = 8192;

/**
 * Reads the last parseable JSON line of a subagent transcript without loading
 * the whole file. A tail read that lands mid-line drops that leading
 * fragment — it is not valid JSON on its own, and the line before it (fully
 * inside the read window) is used instead.
 */
async function readLastSubagentTranscriptEntry(jsonlPath: string): Promise<Record<string, unknown> | null> {
  let fileHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    const stats = await fs.stat(jsonlPath);
    const start = Math.max(0, stats.size - SUBAGENT_TAIL_READ_BYTES);
    const length = stats.size - start;
    if (length <= 0) return null;

    fileHandle = await fs.open(jsonlPath, 'r');
    const buffer = Buffer.alloc(length);
    await fileHandle.read(buffer, 0, length, start);

    const rawLines = buffer.toString('utf8').split('\n');
    const candidateLines = start > 0 ? rawLines.slice(1) : rawLines;

    for (let index = candidateLines.length - 1; index >= 0; index -= 1) {
      const line = candidateLines[index].trim();
      if (!line) continue;
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    // Missing, unreadable or empty transcript: the caller falls back to
    // "running", which is the safe read for a subagent that just started.
    return null;
  } finally {
    await fileHandle?.close();
  }
}

/**
 * Best-effort status/model derived from the subagent's own transcript tail.
 *
 * Not authoritative: the live subagent store the client keeps while a run is
 * in flight is the source of truth for a run that has not written its file
 * yet, and a run that just finished can briefly still read as `running` here
 * until its last line lands on disk.
 */
function deriveSubagentModelAndStatus(
  lastEntry: Record<string, unknown> | null,
): { model: string | null; status: SubagentStatus } {
  if (!lastEntry) return { model: null, status: 'running' };

  if (lastEntry.type === 'assistant') {
    const message = lastEntry.message as Record<string, unknown> | undefined;
    const model = typeof message?.model === 'string' ? message.model : null;
    const content = Array.isArray(message?.content) ? (message.content as Array<Record<string, unknown>>) : [];
    const hasPendingToolUse = content.some((block) => block?.type === 'tool_use');
    return { model, status: hasPendingToolUse ? 'running' : 'completed' };
  }

  if (lastEntry.type === 'user') {
    const message = lastEntry.message as Record<string, unknown> | undefined;
    const content = Array.isArray(message?.content) ? (message.content as Array<Record<string, unknown>>) : [];
    const hasFailedToolResult = content.some(
      (block) => block?.type === 'tool_result' && block?.is_error === true,
    );
    return { model: null, status: hasFailedToolResult ? 'failed' : 'running' };
  }

  return { model: null, status: 'running' };
}

async function readSubagentSummary(
  subagentsDirectory: string,
  metaFileName: string,
): Promise<SessionSubagentSummary | null> {
  const match = SUBAGENT_META_FILE_PATTERN.exec(metaFileName);
  if (!match) return null;
  const agentId = match[1];

  let type = 'general-purpose';
  let description = '';
  let id = agentId;
  // Fallback anchor for the sidebar's "scroll to this subagent" jump, for the
  // rare case its description is too short to match on its own (see
  // `searchTargetLocator.ts`'s `MIN_SNIPPET_LENGTH`).
  let startedAt: string | null = null;
  try {
    const metaPath = path.join(subagentsDirectory, metaFileName);
    const [rawMeta, metaStats] = await Promise.all([fs.readFile(metaPath, 'utf8'), fs.stat(metaPath)]);
    const parsedMeta = JSON.parse(rawMeta) as Record<string, unknown>;
    if (typeof parsedMeta.agentType === 'string' && parsedMeta.agentType) type = parsedMeta.agentType;
    if (typeof parsedMeta.description === 'string') description = parsedMeta.description;
    if (typeof parsedMeta.toolUseId === 'string' && parsedMeta.toolUseId) id = parsedMeta.toolUseId;
    startedAt = metaStats.mtime.toISOString();
  } catch {
    // A meta file that fails to parse still counts as a subagent — it just
    // renders with the defaults above instead of dropping out of the count.
  }

  const transcriptPath = path.join(subagentsDirectory, `agent-${agentId}.jsonl`);
  const lastEntry = await readLastSubagentTranscriptEntry(transcriptPath);
  const { model, status } = deriveSubagentModelAndStatus(lastEntry);

  return { id, type, description, model, status, startedAt };
}

/**
 * Lists the subagents a session spawned, newest file system state only — the
 * live rows for a run that has not written its file yet are added on the
 * client, from the subagent store.
 */
async function listSessionSubagents(jsonlPath: string | null | undefined): Promise<SessionSubagentSummary[]> {
  const subagentsDirectory = deriveSubagentsDirectory(jsonlPath);
  if (!subagentsDirectory) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(subagentsDirectory);
  } catch {
    // No `subagents/` directory is the common case — a session that never
    // spawned a subagent, not an error.
    return [];
  }

  const metaFileNames = entries.filter((name) => SUBAGENT_META_FILE_PATTERN.test(name));
  const summaries = await Promise.all(
    metaFileNames.map((metaFileName) => readSubagentSummary(subagentsDirectory, metaFileName)),
  );
  return summaries.filter((summary): summary is SessionSubagentSummary => summary !== null);
}

/** Una entrada de `~/.cache/aos/sesiones.json` — ver `.claude/bin/sesiones.py` del workspace. Solo los campos que este archivo consume. */
type RegistroSesionEntry = {
  nombre: string;
  session_id: string | null;
  estado: 'viva' | 'caida';
};
type RegistroSesiones = Record<string, RegistroSesionEntry>;

/** Env override solo para tests — el archivo real vive siempre en `~/.cache/aos/sesiones.json`. */
function rutaRegistroSesiones(): string {
  return process.env.AOS_SESIONES_REGISTRO_PATH || path.join(os.homedir(), '.cache', 'aos', 'sesiones.json');
}

/** 5 s: barato de recalcular, y evita un `readFile` por cada fila de cada proyecto en la misma respuesta. */
const REGISTRO_CACHE_MS = 5000;
let registroCache: { data: RegistroSesiones; leidoEn: number } | null = null;

async function leerRegistroSesiones(): Promise<RegistroSesiones> {
  const ahora = Date.now();
  if (registroCache && ahora - registroCache.leidoEn < REGISTRO_CACHE_MS) {
    return registroCache.data;
  }

  try {
    const raw = await fs.readFile(rutaRegistroSesiones(), 'utf8');
    const data = JSON.parse(raw) as RegistroSesiones;
    registroCache = { data, leidoEn: ahora };
    return data;
  } catch {
    // Sin registro (Fase 1 no corrió en esta máquina, o `~/.cache/aos` no existe todavía):
    // el campo `tmux` sale `null` para toda sesión, nunca un error para el sidebar.
    registroCache = { data: {}, leidoEn: ahora };
    return {};
  }
}

/** Solo para tests: fuerza una relectura en la próxima llamada. */
export function _resetRegistroSesionesCacheParaTests(): void {
  registroCache = null;
}

/**
 * Resuelve el estado tmux de una sesión: primero por `session_id` (lo que
 * escribe `registro-sesion.sh` en `SessionStart`, exacto y sin adivinar),
 * y si no hay match, por el nombre determinístico que ya usa
 * `tmux-bridge.service.ts` para las sesiones nacidas en CloudCLI. Cuando dos
 * entradas comparten `session_id` (el registro cae al `.jsonl` más nuevo del
 * proyecto si el hook nunca corrió para esa sesión), gana la que está viva.
 */
export function resolverTmux(
  sessionId: string,
  projectPath: string,
  registro: RegistroSesiones,
): SessionTmuxInfo {
  const porSessionId = Object.values(registro).filter((entry) => entry.session_id === sessionId);
  const directo = porSessionId.find((entry) => entry.estado === 'viva') ?? porSessionId[0];
  if (directo) {
    return { nombre: directo.nombre, vivo: directo.estado === 'viva' };
  }

  const nombreEsperado = nombreTmux(projectPath, sessionId);
  const porNombre = registro[nombreEsperado];
  if (porNombre) {
    return { nombre: porNombre.nombre, vivo: porNombre.estado === 'viva' };
  }

  return null;
}

async function mapSessionRowToSummary(
  row: SessionRepositoryRow,
  projectPath: string,
  registro: RegistroSesiones,
): Promise<SessionSummary> {
  const subagents = await listSessionSubagents(row.jsonl_path);

  return {
    id: row.session_id,
    provider: row.provider,
    summary: row.custom_name || '',
    messageCount: 0,
    lastActivity: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    subagentCount: subagents.length,
    subagents,
    tmux: resolverTmux(row.session_id, projectPath, registro),
  };
}

async function readProjectSessionsIncludingArchived(projectPath: string): Promise<ProjectSessionsPageResult> {
  const rows = sessionsDb.getSessionsByProjectPathIncludingArchived(projectPath) as SessionRepositoryRow[];
  const registro = await leerRegistroSesiones();
  const sessions = await Promise.all(rows.map((row) => mapSessionRowToSummary(row, projectPath, registro)));

  return {
    sessions,
    total: rows.length,
    hasMore: false,
  };
}

/**
 * Reads one paginated project session slice from the DB and groups rows by provider.
 */
async function readProjectSessionsPageByPath(
  projectPath: string,
  options: SessionPaginationOptions = {},
): Promise<ProjectSessionsPageResult> {
  const pagination = normalizeSessionPagination(options);
  const rows = sessionsDb.getSessionsByProjectPathPage(
    projectPath,
    pagination.limit,
    pagination.offset,
  ) as SessionRepositoryRow[];
  const total = sessionsDb.countSessionsByProjectPath(projectPath);
  const registro = await leerRegistroSesiones();
  const sessions = await Promise.all(rows.map((row) => mapSessionRowToSummary(row, projectPath, registro)));

  return {
    sessions,
    total,
    hasMore: pagination.offset + rows.length < total,
  };
}

// Broadcast progress to all connected WebSocket clients.
// Uses the unified `kind` envelope like every other websocket frame.
function broadcastProgress(progress: ProgressUpdate) {
  const message = JSON.stringify({
    kind: 'loading_progress',
    ...progress,
  });

  connectedClients.forEach((client: RealtimeClientConnection) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(message);
    }
  });
}

/**
 * Reads all projects from DB and returns normalized session summaries.
 */
export async function getProjectsWithSessions(
  options: GetProjectsWithSessionsOptions = {}
): Promise<ProjectListItem[]> {
  if (!options.skipSynchronization) {
    await sessionSynchronizerService.synchronizeSessions();
  }

  const projectRows = projectsDb.getProjectPaths() as Array<{
    project_id: string;
    project_path: string;
    custom_project_name?: string | null;
    isStarred?: number;
  }>;
  const totalProjects = projectRows.length;
  const projects: ProjectListItem[] = [];
  let processedProjects = 0;

  for (const row of projectRows) {
    processedProjects += 1;

    const projectId = row.project_id;
    const projectPath = row.project_path;

    broadcastProgress({
      phase: 'loading',
      current: processedProjects,
      total: totalProjects,
      currentProject: projectPath,
    });

    const displayName =
      row.custom_project_name && row.custom_project_name.trim().length > 0
        ? row.custom_project_name
        : await generateDisplayName(path.basename(projectPath) || projectPath, projectPath);

    const sessionsPage = await readProjectSessionsPageByPath(projectPath, {
      limit: options.sessionsLimit,
      offset: options.sessionsOffset,
    });

    projects.push({
      projectId,
      path: projectPath,
      displayName,
      fullPath: projectPath,
      isStarred: Boolean(row.isStarred),
      sessions: sessionsPage.sessions,
      sessionMeta: {
        hasMore: sessionsPage.hasMore,
        total: sessionsPage.total,
      },
    });
  }

  broadcastProgress({
    phase: 'complete',
    current: totalProjects,
    total: totalProjects,
  });

  return projects;
}

/**
 * Reads archived projects from DB and includes every session row for each
 * project path, because an archived workspace should surface all preserved
 * conversation history in the archive view regardless of each session's flag.
 */
export async function getArchivedProjectsWithSessions(
  options: Pick<GetProjectsWithSessionsOptions, 'skipSynchronization'> = {},
): Promise<ArchivedProjectListItem[]> {
  if (!options.skipSynchronization) {
    await sessionSynchronizerService.synchronizeSessions();
  }

  const projectRows = projectsDb.getArchivedProjectPaths() as Array<{
    project_id: string;
    project_path: string;
    custom_project_name?: string | null;
    isStarred?: number;
  }>;

  const archivedProjects: ArchivedProjectListItem[] = [];

  for (const row of projectRows) {
    const displayName =
      row.custom_project_name && row.custom_project_name.trim().length > 0
        ? row.custom_project_name
        : await generateDisplayName(path.basename(row.project_path) || row.project_path, row.project_path);

    const sessionsPage = await readProjectSessionsIncludingArchived(row.project_path);

    archivedProjects.push({
      projectId: row.project_id,
      path: row.project_path,
      displayName,
      fullPath: row.project_path,
      isStarred: Boolean(row.isStarred),
      isArchived: true,
      sessions: sessionsPage.sessions,
      sessionMeta: {
        hasMore: sessionsPage.hasMore,
        total: sessionsPage.total,
      },
    });
  }

  return archivedProjects;
}

/**
 * Loads one paginated session slice for a specific project id.
 */
export async function getProjectSessionsPage(
  projectId: string,
  options: SessionPaginationOptions = {},
): Promise<ProjectSessionsPageApiView> {
  const projectRow = projectsDb.getProjectById(projectId);
  if (!projectRow) {
    throw new AppError(`Project "${projectId}" was not found.`, {
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  }

  const sessionsPage = await readProjectSessionsPageByPath(projectRow.project_path, options);
  return {
    projectId: projectRow.project_id,
    sessions: sessionsPage.sessions,
    sessionMeta: {
      hasMore: sessionsPage.hasMore,
      total: sessionsPage.total,
    },
  };
}
