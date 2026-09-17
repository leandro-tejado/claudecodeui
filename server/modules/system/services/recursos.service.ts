import { readFileSync, statfsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RAM_CEILING_PERCENT, medirRamDesdeTexto } from './ram-ceiling.service.js';
import type { MedicionRam } from './ram-ceiling.service.js';

/**
 * Fase 3 de `16-septiembre-os-orquestador-y-recursos.md`: RAM, disco, sesiones
 * de tmux vivas y el techo del gobernador, para los dos chips del header.
 *
 * Cuenta las sesiones leyendo `~/.cache/aos/sesiones.json` de forma
 * independiente de `projects-with-sessions-fetch.service.ts` (Fase 2): el
 * plan separa los dos alcances a propósito — dos fases mapeando el mismo
 * registro en el mismo grupo paralelizable hubiera sido la colisión de
 * archivo que la REGLA 8 prohíbe.
 */

export type MedicionDisco = {
  usadoPct: number | null;
  usadoGb: number | null;
  totalGb: number | null;
};

export type RecursosSnapshot = {
  kind: 'recursos';
  ram: MedicionRam;
  disco: MedicionDisco;
  sesionesTmux: number;
  techoRam: number;
};

type StatsDisco = { bsize: number; blocks: number; bfree: number };

const BYTES_POR_GB = 1024 ** 3;

function rutaRegistroSesiones(): string {
  return process.env.AOS_SESIONES_REGISTRO_PATH || path.join(os.homedir(), '.cache', 'aos', 'sesiones.json');
}

function leerMeminfoReal(): string {
  return readFileSync('/proc/meminfo', 'utf8');
}

function leerRegistroSesionesReal(): string {
  return readFileSync(rutaRegistroSesiones(), 'utf8');
}

function medirDiscoReal(): StatsDisco {
  const stats = statfsSync('/');
  return { bsize: stats.bsize, blocks: stats.blocks, bfree: stats.bfree };
}

/** Separado de `medirDiscoReal` para que un test le pase números en vez de montar un filesystem falso. */
export function medirDiscoDesdeStats(stats: StatsDisco | null): MedicionDisco {
  if (!stats || !stats.blocks) {
    return { usadoPct: null, usadoGb: null, totalGb: null };
  }
  const totalBytes = stats.blocks * stats.bsize;
  const usadoBytes = (stats.blocks - stats.bfree) * stats.bsize;
  return {
    usadoPct: (usadoBytes / totalBytes) * 100,
    usadoGb: usadoBytes / BYTES_POR_GB,
    totalGb: totalBytes / BYTES_POR_GB,
  };
}

export function contarSesionesTmuxVivas(registroTexto: string): number {
  try {
    const registro = JSON.parse(registroTexto) as Record<string, { estado?: string } | undefined>;
    return Object.values(registro).filter((entry) => entry?.estado === 'viva').length;
  } catch {
    return 0;
  }
}

export type RecursosOptions = {
  leerMeminfo?: () => string;
  leerDisco?: () => StatsDisco;
  leerRegistroSesiones?: () => string;
};

export const recursosService = {
  /**
   * Ningún fallo de lectura individual tira abajo la respuesta entera: RAM,
   * disco y sesiones se miden por separado y cada uno cae a su valor nulo/0
   * si su fuente no está (no-Linux, registro sin Fase 1 corrida, etc.).
   */
  medir(options: RecursosOptions = {}): RecursosSnapshot {
    let ram: MedicionRam;
    try {
      ram = medirRamDesdeTexto((options.leerMeminfo ?? leerMeminfoReal)());
    } catch {
      ram = { porcentajePct: null, usadaGb: null, totalGb: null };
    }

    let disco: MedicionDisco;
    try {
      disco = medirDiscoDesdeStats((options.leerDisco ?? medirDiscoReal)());
    } catch {
      disco = { usadoPct: null, usadoGb: null, totalGb: null };
    }

    let sesionesTmux = 0;
    try {
      sesionesTmux = contarSesionesTmuxVivas((options.leerRegistroSesiones ?? leerRegistroSesionesReal)());
    } catch {
      sesionesTmux = 0;
    }

    return { kind: 'recursos', ram, disco, sesionesTmux, techoRam: RAM_CEILING_PERCENT };
  },
};
