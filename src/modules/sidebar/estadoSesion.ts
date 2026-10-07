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
 * - `libre`: turno cerrado y sin nada pendiente, con un proceso vivo que
 *   espera el próximo mensaje: su pane de tmux sigue en pie.
 * - `dormida`: turno cerrado y sin proceso vivo detrás — el pane murió o lo
 *   hibernó el gobernador. Al escribirle se retoma con `--resume`.
 *
 * Bug del 07-oct: "dormida" se decidía solo por la edad del último cambio
 * (más de 10 min), y una sesión con su tmux vivo esperando el próximo
 * mensaje figuraba dormida. Ahora manda `procesoVivo` (el `tmux.vivo` que ya
 * manda el servidor). Solo una sesión sin dato de tmux —el chat por SDK, que
 * no deja proceso entre turnos— sigue con la regla vieja de los 10 min
 * (`createSessionViewModel.isActive`).
 */
export type EstadoSesion = 'pensando' | 'esperando' | 'libre' | 'dormida';

export type SenalesEstadoSesion = {
  isProcessing: boolean;
  tieneTrabajoDeFondo: boolean;
  necesitaAtencion: boolean;
  tocadaRecientemente: boolean;
  /**
   * `true`/`false`: la sesión tiene pane de tmux y está vivo o no.
   * `null`/ausente: no se sabe (sin tmux, como el chat por SDK).
   */
  procesoVivo?: boolean | null;
};

export function estadoDeSesion({
  isProcessing,
  tieneTrabajoDeFondo,
  necesitaAtencion,
  tocadaRecientemente,
  procesoVivo = null,
}: SenalesEstadoSesion): EstadoSesion {
  if (necesitaAtencion) return 'esperando';
  if (isProcessing || tieneTrabajoDeFondo) return 'pensando';
  if (procesoVivo !== null) return procesoVivo ? 'libre' : 'dormida';
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

/**
 * Qué quiere decir cada estado, para el `title` y el lector de pantalla: el
 * rótulo de una palabra solo no le dice a una persona si tiene que hacer
 * algo. Empieza siempre con el rótulo.
 */
export const DESCRIPCION_ESTADO_SESION: Record<EstadoSesion, string> = {
  pensando: 'pensando: está trabajando en un turno',
  esperando: 'esperando: necesita tu respuesta',
  libre: 'libre: terminó su turno y espera tu próximo mensaje',
  dormida: 'dormida: sin proceso vivo — al escribirle se retoma',
};

/** Clase de color (tokens `ds` de `design-system/branding.md`) por estado. */
export const COLOR_ESTADO_SESION: Record<EstadoSesion, string> = {
  pensando: 'text-ds-primary',
  esperando: 'text-ds-signal-warn',
  libre: 'text-ds-signal-good',
  dormida: 'text-ds-faint',
};
