import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

/**
 * The five-hour usage window, computed from the transcripts Claude Code writes
 * to disk.
 *
 * WHY THIS EXISTS. The server only tells us about the limit once it has already
 * refused a request: `quotaLimits` shows up in a transcript attached to a 429
 * and never before it. On 09-sep the window ran out twice with no warning, so
 * the only way to see it coming is to count locally.
 *
 * WHAT COUNTS. Output tokens — not cache reads, and not dollars. Measured
 * against the two windows that actually ran out that night (resetsAt
 * 1788999000 and 1789018800):
 *
 *   window 1: 1706 turns, 1_631_320 output, 334.2M cache-read, ~$167
 *   window 2: 1620 turns, 1_537_151 output, 290.2M cache-read, ~$218
 *
 * Turns and output land within 6% of each other across two windows that used
 * different model mixes (Opus 5 + Sonnet 5, then Opus 5 + Sonnet 4.6). Cache
 * reads diverge by 15% and dollars by 30%, so neither of those is what the
 * limit meters. Anthropic's own docs agree: cache reads do not count toward
 * input rate limits.
 *
 * Two samples are not a formula, which is why ESTIMATED_LIMIT is a starting
 * point and `recordedLimit()` replaces it with a measured one the first time a
 * 429 of our own shows up. Everything this module returns says which of the two
 * it is; a bar that hides its own uncertainty is worse than no bar.
 */

/** Anthropic's session window. The reset lands exactly five hours after the first message. */
export const WINDOW_MS = 5 * 60 * 60 * 1000;

/** Mean of the two measured windows, used until a 429 of our own calibrates it. */
export const ESTIMATED_LIMIT = 1_584_000;

/** Where the calibration survives a restart. Alongside `assets/`, not in the upstream DB schema. */
const CALIBRATION_FILE = path.join(os.homedir(), '.cloudcli', 'usage-window-calibration.json');

/** Roots to scan. Cursor writes the same JSONL shape, so it is counted too when present. */
const TRANSCRIPT_ROOTS = [
  path.join(os.homedir(), '.claude', 'projects'),
  path.join(os.homedir(), '.cursor', 'projects'),
];

/** Turns older than this are dropped from the index; the window is only five hours wide. */
const RETENTION_MS = 48 * 60 * 60 * 1000;

export type UsageTurn = {
  ts: number;
  model: string;
  out: number;
  /** Transcript file the turn came from, used to group by session. */
  file: string;
  session: string;
  isSubagent: boolean;
};

export type UsageWindowSession = {
  session: string;
  file: string;
  project: string;
  isSubagent: boolean;
  turns: number;
  out: number;
};

export type UsageWindowSnapshot = {
  kind: 'usage_window';
  /** Start of the window in epoch ms, or null when nothing has been sent yet. */
  inicio: number | null;
  /** When the window rolls over. `inicio + WINDOW_MS`, or the server's own value when rejected. */
  resetsAt: number | null;
  /** Output tokens spent inside the window. */
  usados: number;
  limite: number;
  porcentaje: number;
  /** True when the last thing the API said was that we are out. */
  bloqueado: boolean;
  turnos: number;
  porSesion: UsageWindowSession[];
  porModelo: { model: string; turns: number; out: number }[];
  calibradoDe: string;
  timestamp: string;
};

type FileIndex = {
  offset: number;
  size: number;
  turns: UsageTurn[];
  /** epoch ms of every five-hour rejection seen in this file. */
  rejections: number[];
};

const index = new Map<string, FileIndex>();

type Calibration = { limite: number; medidoEn: string; muestras: number[] };
let calibration: Calibration | null = null;

function loadCalibration(): Calibration | null {
  if (calibration) return calibration;
  try {
    const raw = fs.readFileSync(CALIBRATION_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Calibration;
    if (typeof parsed?.limite === 'number' && parsed.limite > 0) {
      calibration = parsed;
    }
  } catch {
    // No calibration yet is the normal first-run state, not an error.
  }
  return calibration;
}

function saveCalibration(next: Calibration): void {
  calibration = next;
  try {
    fs.mkdirSync(path.dirname(CALIBRATION_FILE), { recursive: true });
    fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch (error) {
    console.error('usage-window: could not persist calibration', { error });
  }
}

/** Every `.jsonl` under the transcript roots, including the `subagents/` ones. */
function listTranscripts(): string[] {
  const found: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        found.push(full);
      }
    }
  };

  for (const root of TRANSCRIPT_ROOTS) walk(root, 0);
  return found;
}

/**
 * Reads only the bytes appended since the last pass.
 *
 * A transcript grows by tens of writes per turn, so re-reading all of them on
 * every filesystem event is what would make this cost more CPU than the chat
 * it sits next to. When a file shrinks — truncated, rotated, replaced — the
 * saved offset points past the end and would silently under-count, so that case
 * reindexes the file from zero instead.
 */
async function indexFile(file: string): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    index.delete(file);
    return;
  }

  let entry = index.get(file);
  if (!entry || stat.size < entry.offset) {
    entry = { offset: 0, size: 0, turns: [], rejections: [] };
    index.set(file, entry);
  }
  if (stat.size === entry.offset) {
    entry.size = stat.size;
    return;
  }

  const isSubagent = file.includes(`${path.sep}subagents${path.sep}`);
  const session = path.basename(file, '.jsonl');

  await new Promise<void>((resolve) => {
    const stream = fs.createReadStream(file, { start: entry.offset, encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let consumed = entry.offset;

    rl.on('line', (line) => {
      consumed += Buffer.byteLength(line, 'utf8') + 1;
      if (!line || line.charCodeAt(0) !== 123 /* '{' */) return;

      let row: any;
      try {
        row = JSON.parse(line);
      } catch {
        // A partial last line is normal while a session is mid-write; the next
        // pass re-reads it because `consumed` only advances past parsed bytes.
        return;
      }

      const quota = row?.quotaLimits;
      if (quota?.rateLimitType === 'five_hour' && quota?.status === 'rejected' && quota?.resetsAt) {
        const at = Number(quota.resetsAt) * 1000;
        if (Number.isFinite(at) && !entry!.rejections.includes(at)) entry!.rejections.push(at);
      }

      if (row?.type !== 'assistant') return;
      const usage = row?.message?.usage;
      const model = row?.message?.model;
      if (!usage || !model || model === '<synthetic>') return;

      const ts = Date.parse(row?.timestamp ?? '');
      if (!Number.isFinite(ts)) return;

      entry!.turns.push({
        ts,
        model,
        out: Number(usage.output_tokens) || 0,
        file,
        session,
        isSubagent,
      });
    });

    rl.on('close', () => {
      entry!.offset = Math.min(consumed, stat.size);
      entry!.size = stat.size;
      const cutoff = Date.now() - RETENTION_MS;
      if (entry!.turns.length && entry!.turns[0].ts < cutoff) {
        entry!.turns = entry!.turns.filter((t) => t.ts >= cutoff);
      }
      resolve();
    });

    rl.on('error', () => resolve());
  });
}

/** Refreshes the index across every transcript. Incremental after the first pass. */
export async function refreshIndex(): Promise<void> {
  const files = listTranscripts();
  const live = new Set(files);
  for (const known of index.keys()) {
    if (!live.has(known)) index.delete(known);
  }
  for (const file of files) {
    await indexFile(file);
  }
}

/**
 * Finds where the current window opened.
 *
 * Anthropic starts the window at the first message and closes it five hours
 * later, so the boundaries are not clock-aligned and cannot be assumed. Walking
 * the turns forward and opening a new window whenever one lands five hours past
 * the current start reproduces that. A recorded rejection is a harder fact than
 * the walk, so any turn after one also opens a new window.
 */
function findWindowStart(turns: UsageTurn[], rejections: number[]): number | null {
  if (!turns.length) return null;
  const resets = [...rejections].sort((a, b) => a - b);
  let start: number | null = null;
  let cursor = 0;

  for (const turn of turns) {
    while (cursor < resets.length && resets[cursor] <= (start ?? turn.ts)) cursor += 1;
    const crossedReset = cursor < resets.length && resets[cursor] <= turn.ts;
    if (start === null || turn.ts >= start + WINDOW_MS || crossedReset) {
      start = turn.ts;
      while (cursor < resets.length && resets[cursor] <= turn.ts) cursor += 1;
    }
  }
  return start;
}

/** Project folder a transcript belongs to, for the popover breakdown. */
function projectOf(file: string): string {
  const parts = file.split(path.sep);
  const idx = parts.lastIndexOf('projects');
  if (idx === -1 || idx + 1 >= parts.length) return '?';
  return parts[idx + 1];
}

function allTurns(): { turns: UsageTurn[]; rejections: number[] } {
  const turns: UsageTurn[] = [];
  const rejections: number[] = [];
  for (const entry of index.values()) {
    turns.push(...entry.turns);
    rejections.push(...entry.rejections);
  }
  turns.sort((a, b) => a.ts - b.ts);
  return { turns, rejections: [...new Set(rejections)].sort((a, b) => a - b) };
}

/**
 * Turns a 429 into a measured limit.
 *
 * The rejection carries the moment the window resets, and the window is exactly
 * five hours wide, so the output spent between `resetsAt - 5h` and `resetsAt`
 * is what the account was actually allowed. Averaging the last few keeps one
 * odd window — a limit hit while the machine was half idle — from dragging the
 * bar off.
 */
function calibrate(turns: UsageTurn[], rejections: number[]): void {
  if (!rejections.length) return;
  const samples: number[] = [];
  for (const reset of rejections) {
    const from = reset - WINDOW_MS;
    let sum = 0;
    for (const t of turns) {
      if (t.ts >= from && t.ts < reset) sum += t.out;
    }
    if (sum > 0) samples.push(sum);
  }
  if (!samples.length) return;

  const recent = samples.slice(-5);
  const limite = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  const previous = loadCalibration();
  if (previous?.limite === limite && previous.muestras.length === recent.length) return;

  saveCalibration({
    limite,
    medidoEn: new Date(Math.max(...rejections)).toISOString(),
    muestras: recent,
  });
}

/** Computes the snapshot the header renders. Call `refreshIndex()` first. */
export function buildSnapshot(range?: { desde?: number; hasta?: number }): UsageWindowSnapshot {
  const { turns, rejections } = allTurns();
  calibrate(turns, rejections);

  const stored = loadCalibration();
  const limite = stored?.limite ?? ESTIMATED_LIMIT;
  const calibradoDe = stored ? `medido:${stored.medidoEn.slice(0, 10)}` : 'estimado';

  const now = Date.now();
  const lastReset = rejections.length ? rejections[rejections.length - 1] : null;
  const bloqueado = lastReset !== null && lastReset > now;

  let inicio: number | null;
  let hasta: number;
  if (range?.desde !== undefined) {
    inicio = range.desde;
    hasta = range.hasta ?? now;
  } else if (bloqueado && lastReset !== null) {
    inicio = lastReset - WINDOW_MS;
    hasta = now;
  } else {
    inicio = findWindowStart(turns, rejections);
    hasta = now;
  }

  const inWindow = inicio === null ? [] : turns.filter((t) => t.ts >= inicio! && t.ts < hasta);
  const usados = inWindow.reduce((sum, t) => sum + t.out, 0);

  const bySession = new Map<string, UsageWindowSession>();
  const byModel = new Map<string, { model: string; turns: number; out: number }>();
  for (const t of inWindow) {
    const s = bySession.get(t.file) ?? {
      session: t.session,
      file: t.file,
      project: projectOf(t.file),
      isSubagent: t.isSubagent,
      turns: 0,
      out: 0,
    };
    s.turns += 1;
    s.out += t.out;
    bySession.set(t.file, s);

    const m = byModel.get(t.model) ?? { model: t.model, turns: 0, out: 0 };
    m.turns += 1;
    m.out += t.out;
    byModel.set(t.model, m);
  }

  return {
    kind: 'usage_window',
    inicio,
    resetsAt: bloqueado ? lastReset : inicio === null ? null : inicio + WINDOW_MS,
    usados,
    limite,
    porcentaje: bloqueado ? 100 : Math.min(100, Math.round((usados / limite) * 100)),
    bloqueado,
    turnos: inWindow.length,
    porSesion: [...bySession.values()].sort((a, b) => b.out - a.out),
    porModelo: [...byModel.values()].sort((a, b) => b.out - a.out),
    calibradoDe,
    timestamp: new Date().toISOString(),
  };
}

/** Refresh plus compute, for the route and the broadcaster. */
export async function getUsageWindow(range?: { desde?: number; hasta?: number }): Promise<UsageWindowSnapshot> {
  await refreshIndex();
  return buildSnapshot(range);
}
