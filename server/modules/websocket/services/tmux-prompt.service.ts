import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { sessionsDb } from '@/modules/database/index.js';
import { rutaRegistroSesionesTmux } from '@/modules/providers/index.js';
import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';

const execFileAsync = promisify(execFile);

/**
 * Las preguntas que Claude Code le hace a la persona dentro de un pane de
 * tmux —"Do you want to proceed? 1. Yes / 2. No", "Allow this read outside
 * the working directories?", "Is this a project you trust?"— y que no dejan
 * ningún rastro en el transcript hasta que alguien contesta.
 *
 * Una sesión abierta por `orquestar.py` o `ct` que se frena en una de estas
 * queda parada sin que nadie se entere: `optimumads-guia-1` estuvo casi 10 h
 * así el 30-sep, esperando el "Do you want to proceed?" de la regla `ask` de
 * `Bash(git push *)`. El único lugar donde se ve es la pantalla del pane, así
 * que se lee de ahí (`capture-pane`), como hace `orquestar.py leer`.
 */

export type OpcionPromptTmux = {
  indice: number;
  /** El número que Claude Code dibuja delante ("1. Yes"); `null` en los diálogos sin numerar. */
  numero: number | null;
  etiqueta: string;
  /** La opción de AskUserQuestion que pide escribir la respuesta ("Type something."). */
  libre?: boolean;
};

export type PromptTmux = {
  /** Huella de lo que se ve: la respuesta solo se manda si el pane sigue mostrando exactamente esto. */
  id: string;
  pregunta: string;
  /** Lo que el diálogo muestra arriba de la pregunta: el comando, la regla que lo frenó, la ruta. */
  detalle: string;
  opciones: OpcionPromptTmux[];
  /** Índice de la opción donde está el cursor (`❯`). */
  seleccionada: number;
};

export type PromptTmuxPendiente = PromptTmux & {
  sessionId: string;
  pane: string;
  /** Desde cuándo lo ve este servidor. */
  desde: string;
};

// Todos los diálogos de selección de Claude Code cierran con este pie:
// "Esc to cancel · Tab to amend" (permisos), "Enter to confirm · Esc to
// cancel" (confianza). Mientras corre, el pie dice "esc to interrupt".
const PIE = /\bEsc to cancel\b/;
const REGLA = /^\s*─{8,}\s*$/;
const MARCA = '❯';
const OPCION_NUMERADA = /^(\d+)\.\s+(.*)$/;
// Las pestañas de AskUserQuestion: " ☐ Color", o "←  ☐ Fruta  ☐ Dia  ✔ Submit  →" si son varias.
const PESTANAS = /^\s*←?\s*[☐☒✔]/;
const PESTANAS_VARIAS = /^\s*←.*[☐☒✔].*→\s*$/;
const MAX_LINEAS_DETALLE = 60;
const MAX_LINEAS_PREGUNTA = 4;
// Elegirla abre un campo de texto en el lugar de la opción: se teclea ahí y `Enter` lo manda.
const OPCION_LIBRE = /^Type something\.?$/;

function sinMarca(linea: string): string {
  const recortada = linea.trim();
  return recortada.startsWith(MARCA) ? recortada.slice(MARCA.length).trim() : recortada;
}

/** Una línea del bloque de opciones: la del cursor, una numerada, o la continuación sangrada de una. */
function esLineaDeOpciones(linea: string): boolean {
  if (!linea.trim()) return false;
  return linea.trimStart().startsWith(MARCA)
    || OPCION_NUMERADA.test(sinMarca(linea))
    || /^\s{3,}\S/.test(linea);
}

// Mismo charset que acepta tmux-bridge: un nombre fuera de esto no llega a `tmux -t`.
const NOMBRE_TMUX_PATTERN = /^[A-Za-z0-9_-]+$/;

// La sesión de ttyd: es la terminal de la persona, que ya ve lo que pasa ahí
// (y la REGLA 11 del workspace la deja fuera de todo lo automático).
const SESION_PROHIBIDA = 'web';

function huella(pregunta: string, detalle: string, opciones: OpcionPromptTmux[]): string {
  const texto = [pregunta, detalle, ...opciones.map((opcion) => `${opcion.numero ?? ''}|${opcion.etiqueta}`)].join('\n');
  return createHash('sha1').update(texto).digest('hex').slice(0, 16);
}

/** Quita la sangría del diálogo y el borde `│` con que Claude Code encuadra los comandos largos. */
function limpiarLineaDetalle(linea: string): string {
  return linea.replace(/^\s*│\s?/, '').trim();
}

/**
 * El diálogo de selección que ocupa el fondo del pane, o `null` si no hay
 * ninguno. Pura: recibe el texto de `capture-pane -p` y nada más, así se
 * prueba contra capturas reales sin tmux.
 *
 * La forma, medida el 30-sep en los panes frenados de esta máquina:
 *
 *     ────────────────────────
 *      Bash command
 *        git push --dry-run
 *        Perform a dry-run push
 *
 *      Permission rule Bash(git push *) requires confirmation for this command.
 *
 *      Do you want to proceed?
 *      ❯ 1. Yes
 *        2. No
 *
 *      Esc to cancel · Tab to amend
 *
 * Y la de AskUserQuestion, que el 30-sep se contestó sola porque este
 * detector no la reconocía y un mensaje del chat le mandó el `Enter`:
 *
 *     ────────────────────────
 *     ←  ☐ Fruta  ☐ Dia  ✔ Submit  →
 *     Which fruit?
 *     ❯ 1. Manzana (Recommended)
 *          Apple option
 *       2. Pera
 *          Pear option
 *       3. Type something.
 *     ────────────────────────
 *       4. Chat about this
 *     Enter to select · Tab/Arrow keys to navigate · Esc to cancel
 *
 * El pie tiene que ser la última línea con texto: si el diálogo quedó arriba
 * en el scrollback y abajo hay otra cosa, ya no está esperando. La única
 * pantalla sin pie es la de confirmar un AskUserQuestion de varias preguntas
 * ("Ready to submit your answers?"); esa se reconoce por las pestañas.
 */
export function detectarPromptTmux(pantalla: string): PromptTmux | null {
  const lineas = pantalla.replace(/\r/g, '').split('\n').map((linea) => linea.replace(/\s+$/, ''));

  let fin = lineas.length - 1;
  while (fin >= 0 && !lineas[fin].trim()) fin -= 1;
  if (fin < 0) return null;
  // La última pantalla de un AskUserQuestion de varias preguntas ("Ready to
  // submit your answers?") no tiene pie: ahí la marca del diálogo son las
  // pestañas de arriba, que se revisan más abajo.
  const conPie = PIE.test(lineas[fin]);

  let cursor = conPie ? fin - 1 : fin;
  while (cursor >= 0 && !lineas[cursor].trim()) cursor -= 1;

  // Las opciones: la línea con `❯`, las numeradas y las continuaciones con
  // sangría de tres espacios o más. La pregunta de arriba no es ninguna de
  // esas, y ahí corta. AskUserQuestion separa su última opción ("Chat about
  // this") con una raya: se salta si arriba siguen las opciones.
  const bloque: string[] = [];
  while (cursor >= 0) {
    const linea = lineas[cursor];
    if (REGLA.test(linea) && bloque.length > 0 && esLineaDeOpciones(lineas[cursor - 1] ?? '')) {
      cursor -= 1;
      continue;
    }
    if (!esLineaDeOpciones(linea)) break;
    bloque.unshift(linea);
    cursor -= 1;
  }
  if (bloque.length < 2) return null;

  const numeradas = bloque.some((linea) => OPCION_NUMERADA.test(sinMarca(linea)));
  const opciones: OpcionPromptTmux[] = [];
  let seleccionada = -1;
  for (const linea of bloque) {
    const marcada = linea.trim().startsWith(MARCA);
    const texto = sinMarca(linea);
    const numerada = numeradas ? OPCION_NUMERADA.exec(texto) : null;

    if (numeradas && !numerada) {
      // Una opción larga que se partió en dos renglones, o la descripción de
      // una opción de AskUserQuestion: va con la anterior.
      const anterior = opciones[opciones.length - 1];
      if (!anterior || marcada) return null;
      anterior.etiqueta = `${anterior.etiqueta}\n${texto}`;
      continue;
    }

    if (marcada) {
      if (seleccionada !== -1) return null;
      seleccionada = opciones.length;
    }
    opciones.push({
      indice: opciones.length,
      numero: numerada ? Number(numerada[1]) : null,
      etiqueta: numerada ? numerada[2].trim() : texto,
      ...(numerada && OPCION_LIBRE.test(numerada[2].trim()) ? { libre: true } : {}),
    });
  }

  if (opciones.length < 2 || seleccionada === -1) return null;
  if (numeradas && opciones.some((opcion, indice) => opcion.numero !== indice + 1)) return null;

  // La pregunta va pegada arriba de las opciones, y puede ocupar varios
  // renglones si es larga (las de AskUserQuestion). Corta en la línea en
  // blanco, la raya o las pestañas de AskUserQuestion.
  const renglonesPregunta: string[] = [];
  while (
    cursor >= 0
    && renglonesPregunta.length < MAX_LINEAS_PREGUNTA
    && lineas[cursor].trim()
    && !REGLA.test(lineas[cursor])
    && !PESTANAS.test(lineas[cursor])
  ) {
    renglonesPregunta.unshift(limpiarLineaDetalle(lineas[cursor]));
    cursor -= 1;
  }

  // Lo de arriba, hasta la regla horizontal que abre el diálogo.
  let inicio = cursor;
  while (inicio >= 0 && cursor - inicio < MAX_LINEAS_DETALLE && !REGLA.test(lineas[inicio])) inicio -= 1;
  if (!conPie && !lineas.slice(inicio + 1, cursor + 1).some((linea) => PESTANAS_VARIAS.test(linea))) return null;
  const region = lineas
    .slice(inicio + 1, cursor + 1)
    .map(limpiarLineaDetalle);
  while (region.length > 0 && !region[0]) region.shift();
  while (region.length > 0 && !region[region.length - 1]) region.pop();

  let pregunta = '';
  let cuerpo = region;
  const ultima = region[region.length - 1] ?? '';
  if (renglonesPregunta.length > 0) {
    pregunta = renglonesPregunta.join(' ');
  } else if (ultima.endsWith('?')) {
    pregunta = ultima;
    cuerpo = region.slice(0, -1);
    while (cuerpo.length > 0 && !cuerpo[cuerpo.length - 1]) cuerpo.pop();
  } else {
    // El diálogo de confianza no termina en la pregunta: la tiene en medio de
    // un párrafo ("Quick safety check: Is this a project ... trust? (Like…").
    const conPregunta = region.find((linea) => linea.includes('?'));
    pregunta = conPregunta ? conPregunta.slice(0, conPregunta.indexOf('?') + 1) : (region.find(Boolean) ?? '');
  }
  if (!pregunta) return null;

  const detalle = cuerpo.join('\n');
  return { id: huella(pregunta, detalle, opciones), pregunta, detalle, opciones, seleccionada };
}

export type TeclasTmux =
  | { tipo: 'literal'; texto: string }
  | { tipo: 'teclas'; teclas: string[] }
  | { tipo: 'libre'; numero: string; texto: string };

const MAX_TEXTO_LIBRE = 2000;

/**
 * Qué teclear para elegir una opción. Probado el 30-sep contra un `claude`
 * real en un pane descartable: en un diálogo numerado el dígito elige esa
 * opción de una, esté donde esté el cursor; en uno sin numerar (el de
 * confianza) las flechas mueven el cursor y `Enter` confirma, y llegan bien
 * aunque vayan juntas en un solo `send-keys`. La opción libre de
 * AskUserQuestion ("Type something.") es el dígito, que abre el campo, el
 * texto y `Enter`; el texto va en un solo renglón porque un salto de línea
 * sería un `Enter` a mitad de camino.
 */
export function teclasParaOpcion(prompt: PromptTmux, indice: number, texto = ''): TeclasTmux {
  const opcion = prompt.opciones[indice];
  if (opcion.libre && opcion.numero !== null && opcion.numero <= 9) {
    return {
      tipo: 'libre',
      numero: String(opcion.numero),
      texto: texto.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, MAX_TEXTO_LIBRE),
    };
  }
  if (opcion.numero !== null && opcion.numero <= 9) {
    return { tipo: 'literal', texto: String(opcion.numero) };
  }
  const distancia = indice - prompt.seleccionada;
  const flecha = distancia > 0 ? 'Down' : 'Up';
  return { tipo: 'teclas', teclas: [...Array.from({ length: Math.abs(distancia) }, () => flecha), 'Enter'] };
}

type EntradaRegistro = { nombre?: unknown; session_id?: unknown };

export type VigiaPromptsDependencias = {
  listarPanes: () => Promise<string[]>;
  capturarPane: (nombre: string) => Promise<string>;
  leerRegistro: () => Record<string, EntradaRegistro> | null;
  /** El id de la sesión de la app para un `session_id` del registro, o `null` si CloudCLI no la conoce. */
  sesionDeLaApp: (sessionIdRegistro: string) => string | null;
  enviarTeclas: (nombre: string, teclas: TeclasTmux) => Promise<void>;
  emitir: (payload: Record<string, unknown>) => void;
  /** Si hay alguien mirando: sin clientes conectados no se lee ningún pane. */
  hayClientes: () => boolean;
};

function targetExacto(nombre: string): string {
  return `=${nombre}:`;
}

export const dependenciasVigiaPorDefecto: VigiaPromptsDependencias = {
  listarPanes: async () => {
    try {
      const { stdout } = await execFileAsync('tmux', ['list-sessions', '-F', '#{session_name}'], { timeout: 2000 });
      return stdout.split('\n').map((linea) => linea.trim()).filter(Boolean);
    } catch {
      // Sin servidor de tmux no hay panes.
      return [];
    }
  },
  capturarPane: async (nombre) => {
    // `-S -60`: un comando largo empuja el encabezado del diálogo fuera de la
    // pantalla visible; con un poco de scrollback se ve entero.
    const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-S', '-60', '-t', targetExacto(nombre)], { timeout: 2000 });
    return stdout;
  },
  leerRegistro: () => {
    try {
      const data = JSON.parse(readFileSync(rutaRegistroSesionesTmux(), 'utf8')) as unknown;
      return data && typeof data === 'object' ? (data as Record<string, EntradaRegistro>) : null;
    } catch {
      return null;
    }
  },
  sesionDeLaApp: (sessionIdRegistro) => {
    const fila = sessionsDb.getSessionByProviderSessionId(sessionIdRegistro)
      ?? sessionsDb.getSessionById(sessionIdRegistro);
    return fila?.session_id ?? null;
  },
  enviarTeclas: async (nombre, teclas) => {
    // Como en tmux-bridge: argv por `execFile`, nunca un shell; `-l --` para
    // que el dígito vaya literal.
    const destino = targetExacto(nombre);
    if (teclas.tipo === 'libre') {
      await execFileAsync('tmux', ['send-keys', '-t', destino, '-l', '--', teclas.numero], { timeout: 2000 });
      await execFileAsync('tmux', ['send-keys', '-t', destino, '-l', '--', teclas.texto], { timeout: 2000 });
      await execFileAsync('tmux', ['send-keys', '-t', destino, 'Enter'], { timeout: 2000 });
      return;
    }
    const argv = teclas.tipo === 'literal'
      ? ['send-keys', '-t', destino, '-l', '--', teclas.texto]
      : ['send-keys', '-t', destino, ...teclas.teclas];
    await execFileAsync('tmux', argv, { timeout: 2000 });
  },
  emitir: (payload) => {
    const serializado = JSON.stringify(payload);
    connectedClients.forEach((client) => {
      if (client.readyState === WS_OPEN_STATE) {
        client.send(serializado);
      }
    });
  },
  hayClientes: () => connectedClients.size > 0,
};

// Por nombre de pane: dos panes pueden apuntar a la misma sesión.
let pendientes = new Map<string, PromptTmuxPendiente>();
let revisando: Promise<void> | null = null;
let intervalo: ReturnType<typeof setInterval> | null = null;

/** Lo que hoy espera respuesta, en el orden en que apareció. */
export function promptsTmuxPendientes(): PromptTmuxPendiente[] {
  return [...pendientes.values()].sort((a, b) => a.desde.localeCompare(b.desde));
}

export function mensajePromptsTmux(): Record<string, unknown> {
  return { kind: 'tmux_prompts', prompts: promptsTmuxPendientes(), timestamp: new Date().toISOString() };
}

/** Pane → sesión de la app, para los panes vivos que el registro conoce. */
function panesConSesion(vivos: string[], dependencias: VigiaPromptsDependencias): Map<string, string> {
  const registro = dependencias.leerRegistro() ?? {};
  const porNombre = new Map<string, string>();
  for (const [clave, entrada] of Object.entries(registro)) {
    const nombre = typeof entrada?.nombre === 'string' && entrada.nombre ? entrada.nombre : clave;
    if (typeof entrada?.session_id === 'string' && entrada.session_id) {
      porNombre.set(nombre, entrada.session_id);
    }
  }

  const resultado = new Map<string, string>();
  for (const pane of vivos) {
    if (pane === SESION_PROHIBIDA || !NOMBRE_TMUX_PATTERN.test(pane)) continue;
    const sessionIdRegistro = porNombre.get(pane);
    if (!sessionIdRegistro) continue;
    const sessionId = dependencias.sesionDeLaApp(sessionIdRegistro);
    if (sessionId) resultado.set(pane, sessionId);
  }
  return resultado;
}

async function revisarUnaVez(dependencias: VigiaPromptsDependencias): Promise<void> {
  const vivos = await dependencias.listarPanes();
  const siguientes = new Map<string, PromptTmuxPendiente>();

  for (const [pane, sessionId] of panesConSesion(vivos, dependencias)) {
    let pantalla: string;
    try {
      pantalla = await dependencias.capturarPane(pane);
    } catch {
      continue;
    }
    const prompt = detectarPromptTmux(pantalla);
    if (!prompt) continue;
    const anterior = pendientes.get(pane);
    siguientes.set(pane, {
      ...prompt,
      sessionId,
      pane,
      desde: anterior && anterior.id === prompt.id ? anterior.desde : new Date().toISOString(),
    });
  }

  const cambio = siguientes.size !== pendientes.size
    || [...siguientes].some(([pane, prompt]) => {
      const anterior = pendientes.get(pane);
      return !anterior || anterior.id !== prompt.id || anterior.sessionId !== prompt.sessionId;
    });
  pendientes = siguientes;
  if (cambio) {
    dependencias.emitir(mensajePromptsTmux());
  }
}

/**
 * Lee los panes una vez y avisa a todos si algo cambió. Si ya hay una pasada
 * en curso, espera esa en vez de arrancar otra.
 */
export function revisarPromptsTmux(
  dependencias: VigiaPromptsDependencias = dependenciasVigiaPorDefecto,
): Promise<void> {
  if (!revisando) {
    revisando = revisarUnaVez(dependencias)
      .catch((error: unknown) => {
        console.error('[tmux-prompts] no se pudieron leer los panes:', error instanceof Error ? error.message : error);
      })
      .finally(() => { revisando = null; });
  }
  return revisando;
}

export function iniciarVigiaPromptsTmux(
  intervaloMs = 2000,
  dependencias: VigiaPromptsDependencias = dependenciasVigiaPorDefecto,
): void {
  if (intervalo) return;
  intervalo = setInterval(() => {
    if (!dependencias.hayClientes()) return;
    void revisarPromptsTmux(dependencias);
  }, intervaloMs);
  intervalo.unref?.();
}

export function detenerVigiaPromptsTmux(): void {
  if (intervalo) clearInterval(intervalo);
  intervalo = null;
}

export type RespuestaPromptTmux =
  | { ok: true }
  | { ok: false; codigo: 'TMUX_PROMPT_UNKNOWN' | 'TMUX_PROMPT_STALE' | 'TMUX_PROMPT_BAD_OPTION' | 'TMUX_PROMPT_SEND_FAILED'; mensaje: string };

/**
 * Contesta un prompt con la opción elegida.
 *
 * Solo a un pane que este servidor tiene anotado como esperando respuesta
 * para esa misma sesión, y solo si el pane sigue mostrando el mismo diálogo
 * que vio la persona: se vuelve a leer justo antes de teclear. Si cambió —lo
 * contestaron desde la terminal, o es otra pregunta— no se manda nada.
 */
export async function responderPromptTmux(
  entrada: { sessionId: string; pane: string; promptId: string; opcion: number; texto?: string },
  opciones: { antesDeEnviar?: () => Promise<void> } = {},
  dependencias: VigiaPromptsDependencias = dependenciasVigiaPorDefecto,
): Promise<RespuestaPromptTmux> {
  const anotado = pendientes.get(entrada.pane);
  if (!anotado || anotado.sessionId !== entrada.sessionId || !NOMBRE_TMUX_PATTERN.test(entrada.pane)) {
    return { ok: false, codigo: 'TMUX_PROMPT_UNKNOWN', mensaje: 'Esa sesión ya no tiene una pregunta pendiente.' };
  }

  let actual: PromptTmux | null;
  try {
    actual = detectarPromptTmux(await dependencias.capturarPane(entrada.pane));
  } catch {
    actual = null;
  }
  if (!actual || actual.id !== entrada.promptId) {
    void revisarPromptsTmux(dependencias);
    return {
      ok: false,
      codigo: 'TMUX_PROMPT_STALE',
      mensaje: 'La pregunta cambió o ya la contestaron desde la terminal. No se mandó nada.',
    };
  }

  if (!Number.isInteger(entrada.opcion) || entrada.opcion < 0 || entrada.opcion >= actual.opciones.length) {
    return { ok: false, codigo: 'TMUX_PROMPT_BAD_OPTION', mensaje: 'Esa opción no existe en la pregunta.' };
  }
  const teclas = teclasParaOpcion(actual, entrada.opcion, entrada.texto ?? '');
  if (teclas.tipo === 'libre' && !teclas.texto) {
    return { ok: false, codigo: 'TMUX_PROMPT_BAD_OPTION', mensaje: 'Escribí la respuesta antes de mandarla.' };
  }

  try {
    await opciones.antesDeEnviar?.();
    await dependencias.enviarTeclas(entrada.pane, teclas);
  } catch (error) {
    return {
      ok: false,
      codigo: 'TMUX_PROMPT_SEND_FAILED',
      mensaje: error instanceof Error ? error.message : String(error),
    };
  }

  // Que todos vean el prompt resuelto sin esperar la próxima vuelta.
  setTimeout(() => { void revisarPromptsTmux(dependencias); }, 400).unref?.();
  return { ok: true };
}

/**
 * Si el pane tiene ahora mismo una pregunta abierta. Uno que no se puede leer
 * cuenta como sin pregunta: el `send-keys` que venga después dará el error.
 */
export async function paneTienePrompt(
  pane: string,
  dependencias: Pick<VigiaPromptsDependencias, 'capturarPane'> = dependenciasVigiaPorDefecto,
): Promise<boolean> {
  try {
    return detectarPromptTmux(await dependencias.capturarPane(pane)) !== null;
  } catch {
    return false;
  }
}

/**
 * Espera a que el pane no tenga ninguna pregunta abierta. Devuelve `false` si
 * el pane se murió mientras tanto. Sin límite de tiempo a propósito: la
 * pregunta la contesta una persona, y puede tardar horas.
 */
export async function esperarQueSeDespeje(
  pane: string,
  opciones: { sigueVivo: () => boolean; intervaloMs?: number },
  dependencias: Pick<VigiaPromptsDependencias, 'capturarPane'> = dependenciasVigiaPorDefecto,
): Promise<boolean> {
  const intervaloMs = opciones.intervaloMs ?? 1500;
  while (opciones.sigueVivo()) {
    if (!(await paneTienePrompt(pane, dependencias))) return true;
    await new Promise((resolve) => { setTimeout(resolve, intervaloMs); });
  }
  return false;
}

/** Solo para tests. */
export function _resetPromptsTmuxParaTests(): void {
  detenerVigiaPromptsTmux();
  pendientes = new Map();
  revisando = null;
}
