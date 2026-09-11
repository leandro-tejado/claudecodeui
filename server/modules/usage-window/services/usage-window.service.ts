/**
 * The five-hour and seven-day usage windows, as reported live by the SDK.
 *
 * WHY THIS EXISTS. The server only tells us about the limit once it has already
 * refused a request — except for one message the SDK stream itself emits mid-run:
 * `rate_limit_event`, whose `rate_limit_info.unifiedWindows` carries the REAL
 * utilization (0..1) and reset time for both the five-hour and the seven-day
 * window. That is the only number worth showing, so this module does nothing
 * but hold the latest reading of each and hand it back.
 *
 * WHAT USED TO BE HERE. Until 11-sep-2026 this module counted output tokens
 * across every transcript on disk and calibrated a self-updating 100% mark
 * from them (see `plans/10-septiembre-indicador-ventana-5h.md`, now archived).
 * That calibration counted transcript LINES instead of calls (inflating turns
 * ~2.2x) and measured the wrong unit besides: a corte measured in cost lands
 * inside the normal range for every corte in September, while the same corte
 * measured in output tokens looks like an anomaly. See
 * `plans/11-septiembre-cuota-dos-maquinas.md` for the full measurement. That
 * local estimate is gone — there is nothing left here to recalibrate.
 */

/** A reading older than this is not shown as current; the caller decides what "current" means. */
export const REAL_DATA_STALE_MS = 15 * 60 * 1000;

export type UsageWindowReading = {
  /** 0-100. */
  porcentaje: number;
  /** epoch ms when the window resets, or null when the SDK didn't send one. */
  resetsAt: number | null;
  /** epoch ms: local clock when this reading was recorded. */
  leidoEn: number;
};

export type UsageWindowSnapshot = {
  kind: 'usage_window';
  fiveHour: UsageWindowReading | null;
  sevenDay: UsageWindowReading | null;
};

const state: { fiveHour: UsageWindowReading | null; sevenDay: UsageWindowReading | null } = {
  fiveHour: null,
  sevenDay: null,
};

/** One window's slice of the SDK payload: a 0..1 fraction plus a reset in epoch seconds. */
type RawWindow = { utilization?: unknown; resetsAt?: unknown };

function isRawWindow(value: unknown): value is RawWindow {
  return typeof value === 'object' && value !== null;
}

function toReading(raw: unknown, now: number): UsageWindowReading | null {
  if (!isRawWindow(raw)) return null;
  const utilization = Number(raw.utilization);
  if (!Number.isFinite(utilization)) return null;
  const porcentaje = Math.max(0, Math.min(100, utilization * 100));
  const resetsAtSec = Number(raw.resetsAt);
  const resetsAt = Number.isFinite(resetsAtSec) && resetsAtSec > 0 ? resetsAtSec * 1000 : null;
  return { porcentaje, resetsAt, leidoEn: now };
}

/**
 * Folds one `rate_limit_info` payload into the in-memory state.
 *
 * `unifiedWindows.{five_hour,seven_day}` carries both windows and is the
 * normal shape. Older SDK builds may send neither `unifiedWindows` nor both
 * windows at once — just a bare `utilization` + `rateLimitType` naming the
 * one window that changed — so that shape updates only the window it names
 * and leaves the other one exactly as it was.
 *
 * Returns whether anything changed, so the caller only broadcasts and writes
 * `cuota.json` when there is something new to report.
 */
export function recordRateLimitReading(info: unknown): boolean {
  if (!isRawWindow(info)) return false;
  const now = Date.now();
  const payload = info as Record<string, unknown>;
  let changed = false;

  const unified = payload.unifiedWindows;
  if (isRawWindow(unified)) {
    const fiveHour = toReading((unified as Record<string, unknown>).five_hour, now);
    if (fiveHour) {
      state.fiveHour = fiveHour;
      changed = true;
    }
    const sevenDay = toReading((unified as Record<string, unknown>).seven_day, now);
    if (sevenDay) {
      state.sevenDay = sevenDay;
      changed = true;
    }
    return changed;
  }

  // Fallback shape: a single window, named by `rateLimitType`.
  const reading = toReading(payload, now);
  if (!reading) return false;
  if (payload.rateLimitType === 'five_hour') {
    state.fiveHour = reading;
    changed = true;
  } else if (payload.rateLimitType === 'seven_day') {
    state.sevenDay = reading;
    changed = true;
  }
  return changed;
}

/** Current snapshot. Synchronous: there is nothing left to read from disk. */
export function buildSnapshot(): UsageWindowSnapshot {
  return { kind: 'usage_window', fiveHour: state.fiveHour, sevenDay: state.sevenDay };
}

/** Kept async for its callers (the route and the broadcaster already `await` it). */
export async function getUsageWindow(): Promise<UsageWindowSnapshot> {
  return buildSnapshot();
}
