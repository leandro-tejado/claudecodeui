/**
 * Los cuatro estados de una sesión en la barra, según el boceto de la Fase 11
 * (paso 4): `design-system/visual-refs/05-octubre-header-barra.html`.
 *
 * El boceto dibuja una barra lateral dedicada con ícono + rótulo + color por
 * fila; la barra real de CloudCLI es la lista de sesiones del proyecto
 * (`SidebarSessionItem`), que ya tenía sus propios puntos de color (verde
 * "tocada hace poco", ámbar "necesita atención", violeta "trabajo de fondo").
 * Esta función traduce esas tres señales — más `isProcessing`, que no tenía
 * punto propio — a los cuatro estados del boceto, para que la fila agregue
 * el ícono y el rótulo de texto sin perder ninguna señal que ya tenía:
 *
 * - `esperando`: hay una pregunta o un permiso pendiente — la acción que
 *   falta es del usuario, no de Claude.
 * - `pensando`: el turno principal está en curso, o cerró pero todavía corren
 *   subagentes o workflows que lanzó (ninguno de los dos tiene rótulo propio
 *   en el boceto, así que comparten "pensando": el agente sigue ocupado).
 * - `libre`: turno cerrado, sin nada pendiente, tocada hace menos de 10 min
 *   (`createSessionViewModel.isActive`).
 * - `dormida`: ídem, pero hace más de 10 min. No es la hibernación del
 *   gobernador (eso es tmux, fuera de esta lista) — es la misma idea aplicada
 *   a "esta sesión no tiene nada pasando ahora y hace rato que nadie la mira".
 */
export type EstadoSesion = 'pensando' | 'esperando' | 'libre' | 'dormida';

export type SenalesEstadoSesion = {
  isProcessing: boolean;
  tieneTrabajoDeFondo: boolean;
  necesitaAtencion: boolean;
  tocadaRecientemente: boolean;
};

export function estadoDeSesion({
  isProcessing,
  tieneTrabajoDeFondo,
  necesitaAtencion,
  tocadaRecientemente,
}: SenalesEstadoSesion): EstadoSesion {
  if (necesitaAtencion) return 'esperando';
  if (isProcessing || tieneTrabajoDeFondo) return 'pensando';
  if (tocadaRecientemente) return 'libre';
  return 'dormida';
}

/** Rótulo de texto por estado — nunca solo el color (checklist de accesibilidad del boceto). */
export const ROTULO_ESTADO_SESION: Record<EstadoSesion, string> = {
  pensando: 'pensando',
  esperando: 'esperando',
  libre: 'libre',
  dormida: 'dormida',
};

/** Clase de color (tokens `ds` de `design-system/branding.md`) por estado. */
export const COLOR_ESTADO_SESION: Record<EstadoSesion, string> = {
  pensando: 'text-ds-primary',
  esperando: 'text-ds-signal-warn',
  libre: 'text-ds-signal-good',
  dormida: 'text-ds-faint',
};
