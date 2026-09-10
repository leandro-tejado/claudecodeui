/** Mirror of `UsageWindowSnapshot` in server/modules/usage-window. */
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
  inicio: number | null;
  resetsAt: number | null;
  usados: number;
  limite: number;
  porcentaje: number;
  bloqueado: boolean;
  turnos: number;
  porSesion: UsageWindowSession[];
  porModelo: { model: string; turns: number; out: number }[];
  calibradoDe: string;
  timestamp: string;
};
