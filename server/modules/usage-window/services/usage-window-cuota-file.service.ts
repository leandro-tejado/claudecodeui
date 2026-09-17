import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { UsageWindowReading, UsageWindowSnapshot } from './usage-window.service.js';

/**
 * Persists the real usage-window readings to `~/.cache/aos/cuota.json`, the
 * file the terminal statusline (`cuota-estado.py`) also writes. Both
 * surfaces have to agree on the account's quota, so the shape here is fixed
 * by that script's contract, not chosen freely.
 *
 * Two writers touch this file — the statusline and CloudCLI — so whichever
 * has the newer `ts` wins, and the write itself lands via a temp file plus
 * rename so a reader never sees a half-written file. `fs.rename` overwrites
 * the destination on every platform CloudCLI runs on (Windows included), so
 * no extra handling is needed there.
 */

const CUOTA_DIR = path.join(os.homedir(), '.cache', 'aos');
const CUOTA_FILE = path.join(CUOTA_DIR, 'cuota.json');

type CuotaEstado = {
  ts: number;
  origen: 'cloudcli';
  maquina: 'notebook' | 'vps';
  five_hour: number | null;
  five_hour_resets_at: number | null;
  seven_day: number | null;
  seven_day_resets_at: number | null;
  ctx: null;
};

function toEpochSeconds(ms: number | null | undefined): number | null {
  return typeof ms === 'number' ? Math.round(ms / 1000) : null;
}

function readNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Never throws: a quota file this process cannot write must not take a turn down with it. */
export async function writeCuotaFile(snapshot: UsageWindowSnapshot): Promise<void> {
  const ts = Math.floor(Date.now() / 1000);

  try {
    await fs.mkdir(CUOTA_DIR, { recursive: true });

    let previo: Partial<Record<keyof CuotaEstado, unknown>> = {};
    try {
      previo = JSON.parse(await fs.readFile(CUOTA_FILE, 'utf8')) as typeof previo;
    } catch {
      // Missing or unreadable previous file: nothing to merge in, writing fresh is correct.
    }

    if (typeof previo.ts === 'number' && previo.ts > ts) return;

    // A single rate_limit_event often names only the window that just changed
    // (see `recordRateLimitReading`'s fallback shape), so this process's own
    // in-memory snapshot can be missing a window the file already knows about
    // — and the statusline script is a second, independent writer of this same
    // window. Either way, a reading this process doesn't have yet must fall
    // back to whatever the file already says, never to null: null here reads
    // downstream as "no data", and the weekly-window alert depends on it.
    const estado: CuotaEstado = {
      ts,
      origen: 'cloudcli',
      // CloudCLI runs on the VPS in practice; this only differs when the dev
      // server runs locally on the Windows notebook, same rule the statusline uses.
      maquina: process.platform === 'win32' ? 'notebook' : 'vps',
      five_hour: snapshot.fiveHour
        ? Math.round(snapshot.fiveHour.porcentaje)
        : readNumberOrNull(previo.five_hour),
      five_hour_resets_at: snapshot.fiveHour
        ? toEpochSeconds(snapshot.fiveHour.resetsAt)
        : readNumberOrNull(previo.five_hour_resets_at),
      seven_day: snapshot.sevenDay
        ? Math.round(snapshot.sevenDay.porcentaje)
        : readNumberOrNull(previo.seven_day),
      seven_day_resets_at: snapshot.sevenDay
        ? toEpochSeconds(snapshot.sevenDay.resetsAt)
        : readNumberOrNull(previo.seven_day_resets_at),
      ctx: null,
    };

    const tmp = `${CUOTA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(estado), 'utf8');
    await fs.rename(tmp, CUOTA_FILE);
  } catch (error) {
    console.error('usage-window: failed to write cuota.json', { error });
  }
}

/** What the boot-time seed needs back from the file: both windows, plus when they were recorded. */
export type CuotaFileReading = {
  /** epoch ms — the file's own `ts`, converted. Staleness is judged against this, not against read time. */
  ts: number;
  fiveHour: UsageWindowReading | null;
  sevenDay: UsageWindowReading | null;
};

export type ReadCuotaFileOptions = {
  leerArchivo?: () => string;
};

function leerArchivoReal(): string {
  return readFileSync(CUOTA_FILE, 'utf8');
}

/**
 * The read side of `cuota.json`, for the boot-time seed in `usage-window.service.ts`.
 * Never throws: a missing file, corrupt JSON, or a shape without `ts` all read as
 * "nothing to seed" — same contract as `usageDetalleService.leer`.
 */
export function leerCuotaFile(options: ReadCuotaFileOptions = {}): CuotaFileReading | null {
  let crudo: Partial<CuotaEstado>;
  try {
    crudo = JSON.parse((options.leerArchivo ?? leerArchivoReal)()) as Partial<CuotaEstado>;
  } catch {
    return null;
  }
  if (!crudo || typeof crudo.ts !== 'number') return null;

  const tsMs = crudo.ts * 1000;
  const fiveHour = readNumberOrNull(crudo.five_hour);
  const sevenDay = readNumberOrNull(crudo.seven_day);

  return {
    ts: tsMs,
    fiveHour:
      fiveHour !== null
        ? { porcentaje: fiveHour, resetsAt: toEpochMs(readNumberOrNull(crudo.five_hour_resets_at)), leidoEn: tsMs }
        : null,
    sevenDay:
      sevenDay !== null
        ? { porcentaje: sevenDay, resetsAt: toEpochMs(readNumberOrNull(crudo.seven_day_resets_at)), leidoEn: tsMs }
        : null,
  };
}

function toEpochMs(seconds: number | null): number | null {
  return seconds !== null ? seconds * 1000 : null;
}
