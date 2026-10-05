import type { UsageWindowReading } from '@/modules/usage-window/types';

/**
 * Cómo leer una `UsageWindowReading` contra el reloj, compartido por
 * `UsageWindowIndicator` y `UsageWindowPopover` — antes cada uno tenía su
 * propia copia de `STALE_MS` y su propio `if` de frescura; ahora los dos
 * llaman a `evaluarVentana` y pintan lo mismo.
 *
 * Fase 3 (05-oct, "cuota del header siempre con dato real"): "sin dato" es
 * el estado de cuando NO hay ninguna lectura — nunca el de una lectura
 * vieja. Una lectura vieja se muestra igual, con su antigüedad ("hace N
 * min"); solo cuando la ventana ya pasó su `resetsAt` se deja de mostrar el
 * porcentaje (sería el de la ventana anterior, ya cerrada) y se muestra
 * "ventana nueva" en su lugar.
 */

/** Una lectura con más antigüedad que esto se marca como no fresca (sigue mostrándose). */
export const STALE_MS = 15 * 60 * 1000;

export type EstadoVentana =
  | { tipo: 'sin-dato' }
  | { tipo: 'ventana-nueva'; resetsAt: number }
  | {
      tipo: 'dato';
      porcentaje: number;
      fresca: boolean;
      minutosAntiguedad: number;
      leidoEn: number;
      resetsAt: number | null;
    };

export function evaluarVentana(reading: UsageWindowReading | null, now: number): EstadoVentana {
  if (!reading) return { tipo: 'sin-dato' };
  if (reading.resetsAt !== null && now >= reading.resetsAt) {
    return { tipo: 'ventana-nueva', resetsAt: reading.resetsAt };
  }
  return {
    tipo: 'dato',
    porcentaje: reading.porcentaje,
    fresca: now - reading.leidoEn <= STALE_MS,
    minutosAntiguedad: Math.max(0, Math.round((now - reading.leidoEn) / 60_000)),
    leidoEn: reading.leidoEn,
    resetsAt: reading.resetsAt,
  };
}

/** Hora local, hh:mm — el reset lo reporta el SDK en epoch ms, no en nuestra zona. */
export function formatResetTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
