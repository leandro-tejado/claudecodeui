import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * El título humano de una sesión, en la opción `@titulo` de su pane de tmux.
 *
 * Pedido del 07-oct: el orquestador y Leandro ven las sesiones por su nombre
 * de tmux (`cloudcli-workspace-leandro-a854fb85`, `<proyecto>-<rol>-<n>`), que
 * no dice qué se está trabajando. El nombre no se toca —lo usan el bridge
 * (`assertNombreSesionValido`), `nombreTmux()` y la convención de
 * `claude-tmux`—: el título viaja al lado, con el mismo contrato que
 * `@cuenta`, y `sesiones.py` lo copia al registro.
 */

// El mismo charset que acepta el bridge: un nombre fuera de esto no llega a `tmux -t`.
const NOMBRE_TMUX_PATTERN = /^[A-Za-z0-9_-]+$/;

/** El último título marcado por pane, para no llamar a tmux en cada upsert. */
const ultimoTitulo = new Map<string, string>();

export type OpcionesMarcarTitulo = {
  /** Solo para tests, contra un tmux aislado (`-L`). */
  argsSocket?: string[];
};

/** `true` si marcó; `false` si no hacía falta o tmux no pudo (nunca lanza). */
export async function marcarTituloTmux(
  nombre: string,
  titulo: string,
  { argsSocket = [] }: OpcionesMarcarTitulo = {},
): Promise<boolean> {
  const limpio = titulo.replace(/\s+/g, ' ').trim();
  // Una fila de tmux sin transcript todavía se llama como su pane: no hay título.
  if (!NOMBRE_TMUX_PATTERN.test(nombre) || !limpio || limpio === nombre) {
    return false;
  }
  const clave = `${argsSocket.join(' ')}|${nombre}`;
  if (ultimoTitulo.get(clave) === limpio) {
    return false;
  }
  try {
    await execFileAsync('tmux', [...argsSocket, 'set-option', '-t', `=${nombre}:`, '@titulo', limpio], {
      timeout: 2_000,
    });
    ultimoTitulo.set(clave, limpio);
    return true;
  } catch {
    // El pane murió entre el upsert y esto: lo vuelve a marcar el próximo.
    return false;
  }
}

/** Un pane que murió pierde sus opciones: si revive con el mismo nombre, hay que volver a marcarlo. */
export function olvidarTituloTmux(nombre: string): void {
  ultimoTitulo.delete(`|${nombre}`);
}

type EventoConTmux = {
  session: { summary?: string; tmux?: { nombre: string; vivo: boolean } | null };
};

/**
 * Marca el título de cada sesión con tmux vivo de un lote de `session_upserted`
 * — por ahí pasan todos los cambios de nombre: el sync, el renombrado y el
 * vigía de panes cuando uno revive.
 */
export async function marcarTitulosDeEventos(
  eventos: EventoConTmux[],
  {
    marcar = (nombre: string, titulo: string) => marcarTituloTmux(nombre, titulo),
    olvidar = olvidarTituloTmux,
  }: {
    marcar?: (nombre: string, titulo: string) => Promise<boolean>;
    olvidar?: (nombre: string) => void;
  } = {},
): Promise<void> {
  for (const { session } of eventos) {
    const tmux = session.tmux;
    if (!tmux) continue;
    if (!tmux.vivo) {
      olvidar(tmux.nombre);
      continue;
    }
    if (session.summary) {
      await marcar(tmux.nombre, session.summary);
    }
  }
}
