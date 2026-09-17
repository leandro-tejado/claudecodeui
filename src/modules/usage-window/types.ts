/** Mirror of `UsageWindowSnapshot` in server/modules/usage-window. */
export type UsageWindowReading = {
  /** 0-100. */
  porcentaje: number;
  /** epoch ms when the window resets, or null when the SDK didn't send one. */
  resetsAt: number | null;
  /** epoch ms: when the server recorded this reading. */
  leidoEn: number;
};

export type UsageWindowSnapshot = {
  kind: 'usage_window';
  fiveHour: UsageWindowReading | null;
  sevenDay: UsageWindowReading | null;
};

/** Mirror of `DetalleSesion` en server/modules/usage-window/services/usage-detalle.service.ts. */
export type DetalleSesion = {
  sid: string;
  cwd: string;
  llamadas: number;
  usd: number;
  pct: number;
};

/** Mirror of `DetallePorSkill` en el mismo servicio. */
export type DetallePorSkill = {
  skill: string;
  usd: number;
  pct: number;
};

/** Mirror of `UsageDetalle` en el mismo servicio. `null` cuando `consumo.py detalle` no corrió todavía. */
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

/** Mirror of `GobernadorEstado` en server/modules/system/services/gobernador.service.ts. */
export type GobernadorEstado = {
  color: 'verde' | 'ambar' | 'rojo';
  pace: number | null;
  motivo: string;
};
