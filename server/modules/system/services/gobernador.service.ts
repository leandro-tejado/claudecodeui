import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Fase 5 de plans/16-septiembre-sesiones-persistentes-tmux.md: el semaforo de
 * cuota que respalda el candado de `sessions.service`. Lee el mismo
 * `~/.cache/aos/cuota.json` que la statusline (`cuota-estado.py`) y CloudCLI
 * mismo escriben (ver `usage-window-cuota-file.service.ts`) — este servicio
 * es un tercer lector, nunca escritor, así que no hay regla de "ts más
 * nuevo" que aplicar acá.
 *
 * Existe una implementación hermana en Python
 * (`workspace-leandro/.claude/bin/gobernador.py`) para el tooling de shell
 * de ese repo. Las dos leen el mismo contrato de archivo en vez de
 * invocarse entre sí, igual que los otros escritores de `cuota.json` — este
 * módulo no puede depender de un path de otro repo que no existe en todas
 * las máquinas donde corre CloudCLI.
 */

export type GobernadorColor = 'verde' | 'ambar' | 'rojo';

export type GobernadorEstado = {
  color: GobernadorColor;
  pace: number | null;
  motivo: string;
};

type CuotaJson = {
  five_hour?: number | null;
  five_hour_resets_at?: number | null;
};

const CUOTA_PATH = path.join(os.homedir(), '.cache', 'aos', 'cuota.json');

const PACE_AMBAR = 100;
const PACE_ROJO = 125;
const CUOTA_PELADA_PCT = 98;
const RESPALDO_AMBAR_PCT = 70;
const RESPALDO_ROJO_PCT = 90;
const VENTANA_CINCO_HORAS_SEG = 5 * 60 * 60;
// El pace con la ventana recien abierta explota por division chica (2%
// consumido / 1% transcurrido = pace 200 a los dos minutos): un piso de
// minutos transcurridos antes de calcular evita ese falso rojo.
const PISO_MINUTOS_TRANSCURRIDOS = 5;

const AVISOS_NATIVOS = [/usage limit reached/i, /approaching usage limit/i];
// La sesion de tmux "web" es la de ttyd (regla dura del CLAUDE.md del VPS):
// nunca se lee para esto, igual que espera-cuota.py.
const SESIONES_TMUX_IGNORADAS = new Set(['web']);

function leerCuotaReal(): CuotaJson {
  try {
    return JSON.parse(readFileSync(CUOTA_PATH, 'utf8')) as CuotaJson;
  } catch {
    return {};
  }
}

function capturarPanesReales(): string[] {
  let nombres: string[];
  try {
    nombres = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf8' })
      .split('\n')
      .map((nombre) => nombre.trim())
      .filter(Boolean);
  } catch {
    return [];
  }

  const paneos: string[] = [];
  for (const nombre of nombres) {
    if (SESIONES_TMUX_IGNORADAS.has(nombre)) {
      continue;
    }
    try {
      paneos.push(execFileSync('tmux', ['capture-pane', '-t', nombre, '-p'], { encoding: 'utf8' }));
    } catch {
      // La sesion pudo cerrarse entre el list y el capture: no es un rojo.
    }
  }
  return paneos;
}

/**
 * pace = (% cuota consumido) / (% ventana transcurrida) * 100.
 * 100 es "al ritmo justo para llegar exacto al reset"; por encima, se va a
 * cortar antes de que la ventana termine.
 */
export function calcularPace(
  consumidoPct: number,
  resetsAtEpochSeg: number,
  ahoraEpochSeg: number = Date.now() / 1000,
  ventanaTotalSeg: number = VENTANA_CINCO_HORAS_SEG,
): number {
  const transcurridoSeg = ventanaTotalSeg - (resetsAtEpochSeg - ahoraEpochSeg);
  const pisoSeg = PISO_MINUTOS_TRANSCURRIDOS * 60;
  const transcurridoClamp = Math.max(transcurridoSeg, pisoSeg);
  const pctTranscurrido = (transcurridoClamp / ventanaTotalSeg) * 100;
  return (consumidoPct / pctTranscurrido) * 100;
}

/** Los cinco casos del semaforo. `pace` es `null` cuando falta la ventana. */
export function semaforoDesdePace(
  pace: number | null,
  consumidoPct: number | null,
): { color: GobernadorColor; motivo: string } {
  if (consumidoPct !== null && consumidoPct >= CUOTA_PELADA_PCT) {
    return {
      color: 'rojo',
      motivo: `cuota pelada: ${consumidoPct.toFixed(0)}% consumido (>= ${CUOTA_PELADA_PCT}%)`,
    };
  }

  if (pace === null) {
    if (consumidoPct === null) {
      return { color: 'verde', motivo: 'sin datos de cuota' };
    }
    if (consumidoPct >= RESPALDO_ROJO_PCT) {
      return {
        color: 'rojo',
        motivo: `respaldo sin ventana: ${consumidoPct.toFixed(0)}% consumido (>= ${RESPALDO_ROJO_PCT}%)`,
      };
    }
    if (consumidoPct >= RESPALDO_AMBAR_PCT) {
      return {
        color: 'ambar',
        motivo: `respaldo sin ventana: ${consumidoPct.toFixed(0)}% consumido (>= ${RESPALDO_AMBAR_PCT}%)`,
      };
    }
    return { color: 'verde', motivo: `respaldo sin ventana: ${consumidoPct.toFixed(0)}% consumido` };
  }

  if (pace >= PACE_ROJO) {
    return { color: 'rojo', motivo: `pace ${pace.toFixed(0)}% (>= ${PACE_ROJO}%)` };
  }
  if (pace >= PACE_AMBAR) {
    return { color: 'ambar', motivo: `pace ${pace.toFixed(0)}% (>= ${PACE_AMBAR}%)` };
  }
  return { color: 'verde', motivo: `pace ${pace.toFixed(0)}%` };
}

export type EvaluarGobernadorOptions = {
  ahoraEpochSeg?: number;
  leerCuota?: () => CuotaJson;
  leerPanesTmux?: () => string[];
};

/**
 * Object (not free functions) on purpose: `sessions.service` needs to mock
 * `evaluar` per-test with `t.mock.method`, the same pattern already used for
 * `sessionsService` elsewhere in this codebase.
 */
export const gobernadorService = {
  evaluar(options: EvaluarGobernadorOptions = {}): GobernadorEstado {
    const paneos = (options.leerPanesTmux ?? capturarPanesReales)();
    const avisoNativo = paneos.some((texto) => AVISOS_NATIVOS.some((patron) => patron.test(texto)));
    if (avisoNativo) {
      return {
        color: 'rojo',
        pace: null,
        motivo: 'aviso nativo de cuota detectado en una sesion de tmux',
      };
    }

    const cuota = (options.leerCuota ?? leerCuotaReal)();
    const consumidoPct = typeof cuota.five_hour === 'number' ? cuota.five_hour : null;
    const resetsAt = typeof cuota.five_hour_resets_at === 'number' ? cuota.five_hour_resets_at : null;

    let pace: number | null = null;
    if (consumidoPct !== null && resetsAt !== null) {
      pace = calcularPace(consumidoPct, resetsAt, options.ahoraEpochSeg);
    }

    const { color, motivo } = semaforoDesdePace(pace, consumidoPct);
    return { color, pace, motivo };
  },
};
