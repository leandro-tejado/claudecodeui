import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Sirve `~/.cache/aos/uso-detalle.json` (Fase 4 del plan
 * `16-septiembre-os-orquestador-y-recursos.md`) — nunca lee los `.jsonl` de
 * `~/.claude/projects` en caliente, son 176 MB. El archivo lo escribe
 * `consumo.py detalle --json` (hoy a mano; la Fase 6 lo va a disparar sola
 * cada 10 min). Si todavía no corrió, o la lectura falla, el endpoint
 * responde "sin dato" en vez de inventar un 0.
 */

export type DetalleSesion = {
  sid: string;
  cwd: string;
  llamadas: number;
  usd: number;
  pct: number;
};

export type DetallePorSkill = {
  skill: string;
  usd: number;
  pct: number;
};

export type UsageDetalle = {
  ts: number;
  ventanaInicio: string;
  ventanaFin: string;
  usdTotal: number;
  llamadas: number;
  topSesiones: DetalleSesion[];
  pctSubagentes: number;
  pctCtxAlto: number;
  porSkill: DetallePorSkill[];
};

type UsoDetalleJson = {
  ts?: number;
  error?: string;
  ventana_inicio?: string;
  ventana_fin?: string;
  usd_total?: number;
  llamadas?: number;
  top_sesiones?: Array<{ sid?: string; cwd?: string; llamadas?: number; usd?: number; pct?: number }>;
  pct_subagentes?: number;
  pct_ctx_alto?: number;
  por_skill?: Array<{ skill?: string; usd?: number; pct?: number }>;
};

function rutaDetalle(): string {
  return process.env.AOS_USO_DETALLE_PATH || path.join(os.homedir(), '.cache', 'aos', 'uso-detalle.json');
}

function leerArchivoReal(): string {
  return readFileSync(rutaDetalle(), 'utf8');
}

export type UsageDetalleOptions = {
  leerArchivo?: () => string;
};

export const usageDetalleService = {
  leer(options: UsageDetalleOptions = {}): UsageDetalle | null {
    let crudo: UsoDetalleJson;
    try {
      crudo = JSON.parse((options.leerArchivo ?? leerArchivoReal)()) as UsoDetalleJson;
    } catch {
      return null;
    }
    if (!crudo || crudo.error || typeof crudo.ts !== 'number') return null;

    return {
      ts: crudo.ts,
      ventanaInicio: crudo.ventana_inicio ?? '',
      ventanaFin: crudo.ventana_fin ?? '',
      usdTotal: crudo.usd_total ?? 0,
      llamadas: crudo.llamadas ?? 0,
      topSesiones: (crudo.top_sesiones ?? []).map((s) => ({
        sid: s.sid ?? '?',
        cwd: s.cwd ?? '?',
        llamadas: s.llamadas ?? 0,
        usd: s.usd ?? 0,
        pct: s.pct ?? 0,
      })),
      pctSubagentes: crudo.pct_subagentes ?? 0,
      pctCtxAlto: crudo.pct_ctx_alto ?? 0,
      porSkill: (crudo.por_skill ?? []).map((k) => ({
        skill: k.skill ?? '(sin skill)',
        usd: k.usd ?? 0,
        pct: k.pct ?? 0,
      })),
    };
  },
};
