import { getUsageWindow, recordRateLimitReading } from './usage-window.service.js';
import { scheduleUsageWindowBroadcast } from './usage-window-broadcast.service.js';
import { writeCuotaFile } from './usage-window-cuota-file.service.js';

/**
 * Entry point for the ONE branch `claude-runtime.provider.js` adds for
 * `message.type === 'rate_limit_event'`. Everything the event fans out to —
 * in-memory state, the WebSocket broadcast, `cuota.json` — lives here, which
 * is what keeps that upstream-touching file to a single `if` and one import.
 *
 * Never throws: a bad or missing `rate_limit_info` must not interrupt the
 * message loop it was pulled out of.
 */
export async function recordRateLimitEvent(rateLimitInfo: unknown, cuenta?: string | null): Promise<void> {
  try {
    // La lectura es de la cuenta con la que corrió el turno: se guarda y se
    // escribe en SU archivo de cuota, nunca en el de optimum por defecto.
    const changed = recordRateLimitReading(rateLimitInfo, cuenta);
    if (!changed) return;
    scheduleUsageWindowBroadcast();
    await writeCuotaFile(await getUsageWindow({ cuenta }), cuenta);
  } catch (error) {
    console.error('usage-window: failed to record rate_limit_event', { error });
  }
}
