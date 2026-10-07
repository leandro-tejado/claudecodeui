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
  /**
   * Una opción con casilla, de un AskUserQuestion de varias respuestas: el
   * dígito la marca o la desmarca y el cursor no se mueve; se termina con
   * la opción "Submit" (medido el 5-oct). La etiqueta va sin el "[ ] ".
   */
  casilla?: boolean;
  /** Si la casilla está tildada ahora en el pane ("[✔]"). Solo con `casilla`. */
  marcada?: boolean;
  /**
   * El renglón sin número "Next" o "Submit" de un AskUserQuestion de varias
   * respuestas: no es una respuesta, pasa a la pregunta siguiente o a la
   * pantalla de revisión. Va entre las opciones porque el cursor lo recorre.
   */
  avance?: boolean;
};

/** Una pestaña de AskUserQuestion con varias preguntas: "☒ Frutas", "☐ Colores", "✔ Submit". */
export type PestanaTmux = {
  etiqueta: string;
  /** ☒ contestada, ☐ sin contestar, ✔ la de revisar y enviar. */
  estado: 'respondida' | 'pendiente' | 'enviar';
  /** La que se está viendo: Claude Code la pinta con fondo de color. */
  activa: boolean;
};

/** Una tecla que el pie del diálogo ofrece ("←/→ to change", "Esc to cancel"), con lo que hace. */
export type TeclaDialogoTmux = {
  tecla: 'Up' | 'Down' | 'Left' | 'Right' | 'Enter' | 'Escape' | 'Tab';
  /** Lo que dice el pie que hace ("continue", "cancel"); vacío para las flechas. */
  accion: string;
};

export type PromptTmux = {
  /** Huella de lo que se ve: la respuesta solo se manda si el pane sigue mostrando exactamente esto. */
  id: string;
  pregunta: string;
  /** Lo que el diálogo muestra arriba de la pregunta: el comando, la regla que lo frenó, la ruta. */
  detalle: string;
  /** Vacío en los diálogos que no son una lista de opciones (un formulario): ahí se maneja con `teclas`. */
  opciones: OpcionPromptTmux[];
  /** Índice de la opción donde está el cursor (`❯`); -1 si no hay opciones. */
  seleccionada: number;
  /**
   * Las teclas sueltas que se pueden mandar: todas las del pie si no hay
   * opciones; si las hay, `Esc` y las flechas ←/→ para cambiar de pestaña.
   */
  teclas: TeclaDialogoTmux[];
  /** Selección múltiple: las opciones son casillas y elegir una solo la tilda o destilda. */
  multiple: boolean;
  /** Las pestañas de un AskUserQuestion; vacío en los demás diálogos. */
  pestanas: PestanaTmux[];
};

export type PromptTmuxPendiente = PromptTmux & {
  sessionId: string;
  pane: string;
  /** Desde cuándo lo ve este servidor. */
  desde: string;
};

// Los diálogos de Claude Code cierran con un pie de teclas: "Esc to cancel ·
// Tab to amend" (permisos), "Enter to confirm · Esc to cancel" (confianza),
// "←/→ to change · Enter to continue · Esc to cancel" (el de auto mode del
// 5-oct). Ver `esPie`.
const SEGMENTO_PIE = /^(?:Press\s+)?\S.{0,30}?\s+to\s+\S.{0,40}$/;
const TECLA_DEL_PIE = /^(?:Press\s+)?(?:Esc|Enter)\b/;
// La raya que abre un diálogo o encierra el cuadro de texto. `▔` es la del
// formulario de auto mode, que ocupa la pantalla entera. Una sesión con nombre
// lo lleva metido en la raya de arriba (`──── orquestador ─`): 6-oct, sin esto
// la orquestadora fija daba `sin-cuadro` a todo mensaje desde el chat.
const REGLA = /^\s*[─▔━═]{8,}(?:\s+\S.*?\s+[─▔━═]+)?\s*$/;
const MARCA = '❯';
const OPCION_NUMERADA = /^(\d+)\.\s+(.*)$/;
// Las pestañas de AskUserQuestion: " ☐ Color", o "←  ☐ Fruta  ☐ Dia  ✔ Submit  →" si son varias.
const PESTANAS = /^\s*←?\s*[☐☒✔]/;
const PESTANAS_VARIAS = /^\s*←.*[☐☒✔].*→\s*$/;
const MAX_LINEAS_DETALLE = 60;
const MAX_LINEAS_PREGUNTA = 4;
const MAX_LINEAS_PREGUNTA_ENCUADRADA = 10;
// Elegirla abre un campo de texto en el lugar de la opción: se teclea ahí y `Enter` lo manda.
const OPCION_LIBRE = /^Type something\.?$/;
// Las opciones de un AskUserQuestion de varias respuestas: "[ ] Pera", "[✔] Uva".
const CASILLA = /^\[[ ✔xX✓]\]\s*/;
const ACCION_DE_CASILLAS = /^(?:Submit|Next)$/;

/**
 * Una línea que es entera un pie de teclas: segmentos "<tecla> to <acción>"
 * separados por " · ", y al menos uno de `Esc` o `Enter`. Estricta a
 * propósito: un pie suelto en la respuesta de Claude, pegado al cuadro de
 * texto, no tiene que pasar por diálogo. Distingue mayúsculas: el "esc to
 * interrupt" de mientras corre no es un diálogo.
 */
function esPie(linea: string): boolean {
  const segmentos = linea.trim().split(/\s+·\s+/);
  return segmentos.every((segmento) => SEGMENTO_PIE.test(segmento))
    && segmentos.some((segmento) => TECLA_DEL_PIE.test(segmento));
}

/** Las teclas que nombra el pie, en el orden en que conviene mostrarlas. */
function teclasDelPie(pie: string, conCursor: boolean): TeclaDialogoTmux[] {
  const teclas: TeclaDialogoTmux[] = [];
  const agregar = (tecla: TeclaDialogoTmux['tecla'], accion = '') => {
    if (!teclas.some((existente) => existente.tecla === tecla)) teclas.push({ tecla, accion });
  };
  const segmentos = pie.trim().split(/\s+·\s+/).map((segmento) => segmento.replace(/^Press\s+/, ''));
  const accionDe = (segmento: string) => segmento.replace(/^.*?\s+to\s+/, '').trim();
  if (conCursor || segmentos.some((segmento) => /↑|↓|Arrow keys/i.test(segmento))) {
    agregar('Up');
    agregar('Down');
  }
  for (const segmento of segmentos) {
    if (/←|→/.test(segmento)) {
      agregar('Left', accionDe(segmento));
      agregar('Right', accionDe(segmento));
    }
  }
  for (const segmento of segmentos) {
    if (/^Tab\b(?!\/)/.test(segmento)) agregar('Tab', accionDe(segmento));
  }
  for (const segmento of segmentos) {
    if (/^Enter\b/.test(segmento)) agregar('Enter', accionDe(segmento));
    if (/^Esc\b/.test(segmento)) agregar('Escape', accionDe(segmento));
  }
  return teclas;
}

// Lo que `capture-pane -e` agrega: los colores y atributos. Se leen para
// distinguir el texto de ejemplo atenuado del cuadro vacío; para todo lo
// demás estorban.
const SECUENCIA_SGR = /\x1b\[[0-9;?]*[A-Za-z]/g;
// La primera línea del cuadro de texto: `❯` (o `!` en modo bash) y lo escrito.
const INICIO_CUADRO = /^\s{0,2}[❯!]/;
const MAX_LINEAS_CUADRO = 40;

export function sinEscapes(texto: string): string {
  return texto.replace(SECUENCIA_SGR, '');
}

type CuadroDeEntrada = {
  /** Índice de la raya de arriba del cuadro: lo que está más arriba es la conversación (o un diálogo). */
  rayaSuperior: number;
  /** Lo escrito, sin el `❯`; vacío si el cuadro solo muestra el texto de ejemplo. */
  texto: string;
};

/**
 * Si todo lo visible del cuadro (después del `❯`) está atenuado (`ESC[2m`):
 * es la sugerencia de próximo prompt o el ejemplo de cuadro vacío, que Enter
 * no manda. Se mira cada renglón por separado porque la captura repite los
 * atributos al principio de cada uno cuando la sugerencia parte en varios.
 */
function textoTodoAtenuado(crudas: string[]): boolean {
  let hayTexto = false;
  for (let indice = 0; indice < crudas.length; indice += 1) {
    const cruda = crudas[indice];
    let atenuado = false;
    let pasoLaMarca = indice > 0;
    let resto = cruda;
    while (resto) {
      const sgr = /^\x1b\[([0-9;]*)m/.exec(resto);
      if (sgr) {
        const parametros = sgr[1] === '' ? ['0'] : sgr[1].split(';');
        for (let i = 0; i < parametros.length; i += 1) {
          const parametro = parametros[i];
          // `38;5;n` y `38;2;r;g;b` (y 48/58) llevan argumentos que no son atributos.
          if (parametro === '38' || parametro === '48' || parametro === '58') i += parametros[i + 1] === '2' ? 4 : 2;
          else if (parametro === '0' || parametro === '22') atenuado = false;
          else if (parametro === '2') atenuado = true;
        }
        resto = resto.slice(sgr[0].length);
        continue;
      }
      const otra = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(resto);
      if (otra) {
        resto = resto.slice(otra[0].length);
        continue;
      }
      const caracter = resto[0];
      resto = resto.slice(1);
      if (!pasoLaMarca) {
        if (caracter === '❯' || caracter === '!') pasoLaMarca = true;
        continue;
      }
      if (/[\s\u00a0]/.test(caracter)) continue;
      if (!atenuado) return false;
      hayTexto = true;
    }
  }
  return hayTexto;
}

/**
 * El cuadro de texto de Claude Code al pie del pane, si está. Medido el 5-oct:
 *
 *     ──────────────────────
 *     ❯ lo que se escribió
 *       y su segundo renglón
 *     ──────────────────────
 *       ctx 13% · 5h 3%
 *       ⏵⏵ auto mode on (shift+tab to cycle)
 *
 * Vacío muestra un ejemplo atenuado (`❯ Try "create a util…"`) que en el
 * texto plano no se distingue de algo escrito: por eso se lee la captura con
 * `-e` y lo atenuado (`ESC[2m`) cuenta como vacío. Lo mismo la sugerencia de
 * próximo prompt que Claude Code deja en gris tras un turno (medido el 5-oct:
 * `❯\u00a0ESC[2m…ESC[0m`): Enter no la manda, no es texto escrito.
 */
function ubicarCuadroDeEntrada(crudas: string[]): CuadroDeEntrada | null {
  const lineas = crudas.map((linea) => sinEscapes(linea).replace(/\s+$/, ''));
  let fin = lineas.length - 1;
  while (fin >= 0 && !lineas[fin].trim()) fin -= 1;

  // La raya de abajo es la última del pane, esté a la distancia que esté del
  // pie. Hasta el 7-oct se buscaba solo en las últimas 8 líneas, y lo que
  // Claude Code dibuja debajo del cuadro puede ser más: el panel de atajos
  // (`?`) en un pane de 60 columnas ocupa 11 (medido en 2.1.292), y el chat
  // contestaba `sin-cuadro` sobre un cuadro vacío y a la vista. Lo que separa
  // al cuadro de un diálogo es la forma: un pie de teclas ("Enter to select ·
  // Esc to cancel") debajo de esa raya es un diálogo, y el cuadro no lo tiene.
  let rayaInferior = -1;
  for (let i = fin; i >= 0; i -= 1) {
    if (REGLA.test(lineas[i])) {
      rayaInferior = i;
      break;
    }
  }
  if (rayaInferior < 1) return null;
  if (lineas.slice(rayaInferior + 1, fin + 1).some(esPie)) return null;

  let rayaSuperior = -1;
  for (let i = rayaInferior - 1; i >= 0 && rayaInferior - i <= MAX_LINEAS_CUADRO; i -= 1) {
    if (REGLA.test(lineas[i])) {
      rayaSuperior = i;
      break;
    }
  }
  if (rayaSuperior < 0 || rayaSuperior + 1 >= rayaInferior) return null;
  if (!INICIO_CUADRO.test(lineas[rayaSuperior + 1])) return null;

  const atenuado = textoTodoAtenuado(crudas.slice(rayaSuperior + 1, rayaInferior));

  const renglones = lineas.slice(rayaSuperior + 1, rayaInferior);
  renglones[0] = renglones[0].replace(INICIO_CUADRO, '');
  const texto = renglones.map((renglon) => renglon.replace(/^[\s\u00a0]+/, '')).join('\n').trim();
  return { rayaSuperior, texto: atenuado ? '' : texto };
}

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

function huella(
  pregunta: string,
  detalle: string,
  opciones: OpcionPromptTmux[],
  teclas: TeclaDialogoTmux[],
  pestanas: PestanaTmux[] = [],
): string {
  // La pestaña activa cuenta: cambiar de pestaña es otra pantalla. Lo
  // tildado, desde la Fase 9 (paso 2), no: la tarjeta compone toda la
  // selección en el cliente y manda un solo pedido al final, y ese pedido
  // necesariamente tilda casillas distintas de las que había cuando la
  // pregunta apareció — si la huella las contara, el pedido compuesto
  // siempre llegaría "viejo" (TMUX_PROMPT_STALE) contra sí mismo. El tilde
  // hecho desde la terminal, fuera de esta tarjeta, ya no invalida el id;
  // ese caso más angosto es el precio.
  const texto = [
    pregunta,
    detalle,
    ...opciones.map((opcion) => `${opcion.numero ?? ''}|${opcion.casilla ? 'c' : ''}|${opcion.etiqueta}`),
    ...teclas.map((tecla) => `${tecla.tecla}|${tecla.accion}`),
    ...pestanas.map((pestana) => `${pestana.estado}|${pestana.activa ? '*' : ''}|${pestana.etiqueta}`),
  ].join('\n');
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
 * El 5-oct aparecieron dos más, y ninguno pasaba: el aviso "Teach auto mode
 * about your environment? 1. Yes / 2. Not now / 3. Don't show again", que se
 * dibuja arriba del cuadro de texto en vez de reemplazarlo, y el formulario
 * que abre su "Yes" (renglones con su valor, "←/→ to change · Enter to
 * continue · Esc to cancel"). Un "1" mandado desde el chat se lo comió el
 * diálogo. El formulario, y cualquier diálogo con pie que no sea una lista de
 * opciones, sale con las teclas de su pie en vez de opciones.
 *
 * El pie tiene que ser la última línea con texto (o la última arriba del
 * cuadro de texto): si el diálogo quedó arriba en el scrollback y abajo hay
 * otra cosa, ya no está esperando. La única pantalla sin pie es la de
 * confirmar un AskUserQuestion de varias preguntas ("Ready to submit your
 * answers?"); esa se reconoce por las pestañas.
 */
export function detectarPromptTmux(pantalla: string): PromptTmux | null {
  const crudas = pantalla.replace(/\r/g, '').split('\n');
  // Un diálogo chico —el "Teach auto mode about your environment?" del
  // 5-oct— se dibuja arriba del cuadro de texto, que sigue al pie del pane.
  // Lo que cuenta es lo que está justo encima del cuadro.
  const cuadro = ubicarCuadroDeEntrada(crudas);
  const lineas = crudas
    .slice(0, cuadro ? cuadro.rayaSuperior : crudas.length)
    .map((linea) => sinEscapes(linea).replace(/\s+$/, ''));

  let fin = lineas.length - 1;
  while (fin >= 0 && !lineas[fin].trim()) fin -= 1;
  if (fin < 0) return null;
  // La última pantalla de un AskUserQuestion de varias preguntas ("Ready to
  // submit your answers?") no tiene pie: ahí la marca del diálogo son las
  // pestañas de arriba, que se revisan más abajo.
  const conPie = esPie(lineas[fin]);

  // "←/→ to change": un formulario, no una lista. Sus renglones son campos
  // con su valor, y elegir uno con `Enter` no es lo que pide.
  if (conPie && /\bto change\b/.test(lineas[fin])) return dialogoConTeclas(lineas, fin);
  return dialogoConOpciones(lineas, crudas, fin, conPie) ?? (conPie ? dialogoConTeclas(lineas, fin) : null);
}

/**
 * Cualquier otro diálogo con pie de teclas: lo que muestra va tal cual, y se
 * maneja con las teclas que el pie nombra. Es la red para lo que Claude Code
 * agregue mañana; necesita la raya que abre el diálogo para no tomar por
 * diálogo un pie suelto en la conversación.
 */
function dialogoConTeclas(lineas: string[], fin: number): PromptTmux | null {
  let inicio = fin - 1;
  while (inicio >= 0 && fin - inicio <= MAX_LINEAS_DETALLE && !REGLA.test(lineas[inicio])) inicio -= 1;
  if (inicio < 0 || !REGLA.test(lineas[inicio])) return null;

  const region = lineas.slice(inicio + 1, fin).map((linea) => linea.trim());
  while (region.length > 0 && !region[0]) region.shift();
  while (region.length > 0 && !region[region.length - 1]) region.pop();
  if (region.length === 0) return null;

  const pregunta = limpiarLineaDetalle(region[0]);
  const cuerpo = region.slice(1);
  while (cuerpo.length > 0 && !cuerpo[0]) cuerpo.shift();
  const detalle = cuerpo.join('\n');
  const teclas = teclasDelPie(lineas[fin], region.some((linea) => linea.startsWith(MARCA)));
  if (teclas.length === 0) return null;
  return {
    id: huella(pregunta, detalle, [], teclas),
    pregunta,
    detalle,
    opciones: [],
    seleccionada: -1,
    teclas,
    multiple: false,
    pestanas: [],
  };
}

/** Los diálogos de una lista de opciones: los de permiso, el de confianza, AskUserQuestion. */
function dialogoConOpciones(lineas: string[], crudas: string[], fin: number, conPie: boolean): PromptTmux | null {
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

    // El renglón "Submit" (o "Next") de un AskUserQuestion de varias
    // respuestas: no tiene número, se llega con las flechas y se elige con
    // `Enter`. Va como opción propia, en el orden en que lo recorre el cursor.
    if (numeradas && !numerada && ACCION_DE_CASILLAS.test(texto) && opciones.some((opcion) => opcion.casilla)) {
      if (marcada) {
        if (seleccionada !== -1) return null;
        seleccionada = opciones.length;
      }
      opciones.push({ indice: opciones.length, numero: null, etiqueta: texto, avance: true });
      continue;
    }

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
    const completa = numerada ? numerada[2].trim() : texto;
    const casilla = numerada ? CASILLA.exec(completa) : null;
    const etiqueta = casilla ? completa.slice(casilla[0].length) : completa;
    opciones.push({
      indice: opciones.length,
      numero: numerada ? Number(numerada[1]) : null,
      etiqueta,
      ...(numerada && OPCION_LIBRE.test(etiqueta) ? { libre: true } : {}),
      ...(casilla ? { casilla: true, marcada: casilla[0].trim() !== '[ ]' } : {}),
    });
  }

  if (opciones.length < 2 || seleccionada === -1) return null;
  // Con algo escrito, el renglón libre de las casillas ya no dice "Type
  // something" sino lo escrito ("[✔] Jueves"). AskUserQuestion lo pone
  // siempre último, pegado al "Next"/"Submit".
  const avance = opciones.findIndex((opcion) => opcion.avance);
  if (avance > 0 && !opciones.some((opcion) => opcion.libre) && opciones[avance - 1].casilla) {
    opciones[avance - 1].libre = true;
  }
  const numeros = opciones.flatMap((opcion) => (opcion.numero === null ? [] : [opcion.numero]));
  if (numeradas && numeros.some((numero, indice) => numero !== indice + 1)) return null;

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
  // La pregunta larga de AskUserQuestion (5-oct) va encuadrada con `│` y con
  // un renglón en blanco antes de las opciones.
  if (renglonesPregunta.length === 0 && cursor >= 1 && !lineas[cursor].trim() && /^\s*│/.test(lineas[cursor - 1])) {
    let arriba = cursor - 1;
    const encuadrados: string[] = [];
    while (arriba >= 0 && encuadrados.length < MAX_LINEAS_PREGUNTA_ENCUADRADA && /^\s*│/.test(lineas[arriba])) {
      encuadrados.unshift(limpiarLineaDetalle(lineas[arriba]));
      arriba -= 1;
    }
    renglonesPregunta.push(...encuadrados);
    cursor = arriba;
  }

  // Lo de arriba, hasta la regla horizontal que abre el diálogo.
  let inicio = cursor;
  while (inicio >= 0 && cursor - inicio < MAX_LINEAS_DETALLE && !REGLA.test(lineas[inicio])) inicio -= 1;
  if (!conPie && !lineas.slice(inicio + 1, cursor + 1).some((linea) => PESTANAS_VARIAS.test(linea))) return null;
  // Las pestañas van en el primer renglón, pegadas a la raya: se leen de la
  // captura con colores (la activa tiene fondo) y salen del detalle.
  let primera = inicio + 1;
  while (primera <= cursor && !lineas[primera].trim()) primera += 1;
  const pestanas = primera <= cursor && PESTANAS.test(lineas[primera]) ? leerPestanas(crudas[primera]) : [];
  const region = lineas
    .slice(pestanas.length > 0 ? primera + 1 : inicio + 1, cursor + 1)
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
  // Con opciones, de las teclas del pie solo `Esc`: cancelar también es una
  // respuesta, y las flechas sobran donde cada opción es un botón. Salvo
  // ←/→ con pestañas: cambian de pregunta sin perder lo tildado (5-oct), y
  // en una de casillas son la única forma de seguir sin el renglón "Next".
  const teclas: TeclaDialogoTmux[] = [];
  const activa = pestanas.findIndex((pestana) => pestana.activa);
  if (pestanas.length > 1 && activa !== -1) {
    if (activa > 0) teclas.push({ tecla: 'Left', accion: 'previous' });
    if (activa < pestanas.length - 1) {
      teclas.push({ tecla: 'Right', accion: pestanas[activa + 1].estado === 'enviar' ? 'review' : 'next' });
    }
  }
  if (conPie) teclas.push(...teclasDelPie(lineas[fin], false).filter((tecla) => tecla.tecla === 'Escape'));
  return {
    id: huella(pregunta, detalle, opciones, teclas, pestanas),
    pregunta,
    detalle,
    opciones,
    seleccionada,
    teclas,
    multiple: opciones.some((opcion) => opcion.casilla),
    pestanas,
  };
}

const ESTADO_PESTANA: Record<string, PestanaTmux['estado']> = { '☒': 'respondida', '☐': 'pendiente', '✔': 'enviar' };
const PESTANA = /([☐☒✔])\s+([^☐☒✔→]+)/g;

/**
 * Las pestañas de un renglón crudo de `capture-pane -e`. Medido el 5-oct:
 *
 *     ←  ☒ Frutas  ☐ Colores ESC[48;5;153m ☒ Dias ESC[49m ✔ Submit  →
 *
 * La activa es la que va con fondo de color; sin colores (o con una sola
 * pestaña, que no se pinta) se da por activa la única que hay.
 */
function leerPestanas(cruda: string): PestanaTmux[] {
  let plano = '';
  const conFondo: boolean[] = [];
  let fondo = false;
  for (const parte of cruda.split(/(\x1b\[[0-9;?]*[A-Za-z])/)) {
    if (!parte.startsWith('\x1b[')) {
      plano += parte;
      for (let i = 0; i < parte.length; i += 1) conFondo.push(fondo);
      continue;
    }
    if (!parte.endsWith('m')) continue;
    const parametros = parte.slice(2, -1).split(';');
    for (let i = 0; i < parametros.length; i += 1) {
      const parametro = parametros[i];
      if (parametro === '38' || parametro === '48') {
        if (parametro === '48') fondo = true;
        // 5;N o 2;R;G;B: son parte del color, no atributos sueltos.
        i += parametros[i + 1] === '5' ? 2 : parametros[i + 1] === '2' ? 4 : 0;
      } else if (parametro === '' || parametro === '0' || parametro === '49' || parametro === '27') {
        fondo = false;
      } else if (parametro === '7' || /^(?:4[0-7]|10[0-7])$/.test(parametro)) {
        fondo = true;
      }
    }
  }

  const pestanas: PestanaTmux[] = [];
  for (const encontrada of plano.matchAll(PESTANA)) {
    const etiqueta = encontrada[2].trim();
    if (!etiqueta) continue;
    pestanas.push({
      etiqueta,
      estado: ESTADO_PESTANA[encontrada[1]],
      activa: conFondo[encontrada.index ?? 0] === true,
    });
  }
  if (pestanas.length === 1) pestanas[0].activa = true;
  return pestanas;
}

export type TeclasTmux =
  | { tipo: 'literal'; texto: string }
  | { tipo: 'teclas'; teclas: string[] }
  | { tipo: 'libre'; numero: string; texto: string }
  | { tipo: 'escribir'; teclas: string[]; texto: string }
  /**
   * Varios pasos, uno tras otro, en un solo pedido: lo que compone
   * `teclasParaSeleccionCompuesta` (Fase 9, paso 2) — un dígito por casilla
   * que cambia, la libre con su texto si corresponde, y el avance al final.
   */
  | { tipo: 'secuencia'; pasos: TeclasTmux[] };

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
  const distancia = indice - prompt.seleccionada;
  const flechas = Array.from({ length: Math.abs(distancia) }, () => (distancia > 0 ? 'Down' : 'Up'));
  const enUnRenglon = texto.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, MAX_TEXTO_LIBRE);
  // Con casillas, el campo libre se llena llegando con el cursor y
  // tecleando: queda marcado solo, y un `Enter` lo desmarcaría. `C-u` borra
  // lo que hubiera escrito antes, así lo nuevo lo reemplaza (medido el 5-oct).
  if (opcion.libre && opcion.casilla) {
    return { tipo: 'escribir', teclas: [...flechas, 'C-u'], texto: enUnRenglon };
  }
  if (opcion.libre && opcion.numero !== null && opcion.numero <= 9) {
    return { tipo: 'libre', numero: String(opcion.numero), texto: enUnRenglon };
  }
  if (opcion.numero !== null && opcion.numero <= 9) {
    return { tipo: 'literal', texto: String(opcion.numero) };
  }
  return { tipo: 'teclas', teclas: [...flechas, 'Enter'] };
}

/**
 * Qué teclear para un AskUserQuestion de varias casillas, de una: en vez de
 * un pedido por clic —cada uno cambiaba la huella antes de que el pane
 * redibujara, y el próximo clic llegaba contra una pantalla que ya no
 * existía (TMUX_PROMPT_STALE)— la tarjeta compone toda la selección en el
 * cliente y esto calcula la secuencia completa de una sola vez: un dígito
 * por cada casilla que tiene que cambiar de estado, la libre con su texto
 * si la pide, y al final el avance ("Next"/"Submit"). Las casillas
 * numeradas no mueven el cursor al tildarse, así que el orden entre ellas
 * no importa; el avance sí parte de `prompt.seleccionada`, igual que
 * `teclasParaOpcion`.
 *
 * Pura: no toca tmux, solo lee `prompt` (ya parseado) y devuelve qué mandar.
 */
export function teclasParaSeleccionCompuesta(
  prompt: PromptTmux,
  seleccion: number[],
  texto = '',
): TeclasTmux {
  const deseado = new Set(seleccion);
  const pasos: TeclasTmux[] = [];

  for (const opcion of prompt.opciones) {
    if (opcion.avance || !opcion.casilla || opcion.libre) continue;
    const yaMarcada = opcion.marcada === true;
    if (deseado.has(opcion.indice) !== yaMarcada) {
      pasos.push(teclasParaOpcion(prompt, opcion.indice));
    }
  }

  const libre = prompt.opciones.find((opcion) => opcion.casilla && opcion.libre && deseado.has(opcion.indice));
  if (libre && texto) {
    pasos.push(teclasParaOpcion(prompt, libre.indice, texto));
  }

  const avance = prompt.opciones.find((opcion) => opcion.avance);
  if (avance) {
    pasos.push(teclasParaOpcion(prompt, avance.indice));
    if (/^submit$/i.test(avance.etiqueta)) {
      // El "Submit" de un AskUserQuestion de casillas no manda la
      // respuesta: abre "Ready to submit your answers?" (ver el test de
      // la "pantalla de revisión" más arriba), con "1. Submit answers" ya
      // elegido por default — sin confirmarla ahí se quedaba trabada (Fase
      // 11, paso 3). Como el dígito elige "esté donde esté el cursor" (ver
      // `teclasParaOpcion`), manda el "1" de una, en el mismo pedido: no
      // hace falta ver la pantalla nueva dibujada para saber qué apretar,
      // es siempre la misma. "Next" (entre preguntas de una tabanda) NO
      // entra acá: ese autoavanza sin revisión.
      pasos.push({ tipo: 'literal', texto: '1' });
    }
  }

  if (pasos.length === 0) {
    return { tipo: 'teclas', teclas: [] };
  }
  return pasos.length === 1 ? pasos[0] : { tipo: 'secuencia', pasos };
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
    // `-e`: con los atributos, para distinguir el texto de ejemplo atenuado
    // del cuadro de texto de algo escrito (ver `ubicarCuadroDeEntrada`).
    const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-e', '-S', '-60', '-t', targetExacto(nombre)], { timeout: 2000 });
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
    if (teclas.tipo === 'secuencia') {
      // Un solo pedido, varios pasos tmux: cada uno se manda y se espera
      // antes del siguiente (send-keys no hace falta que se vea dibujado
      // entre pasos — el dígito de una casilla no depende de redraw — pero
      // sí que no se pisen en el mismo exec).
      for (const paso of teclas.pasos) {
        await dependenciasVigiaPorDefecto.enviarTeclas(nombre, paso);
      }
      return;
    }
    if (teclas.tipo === 'escribir') {
      if (teclas.teclas.length > 0) {
        await execFileAsync('tmux', ['send-keys', '-t', destino, ...teclas.teclas], { timeout: 2000 });
      }
      await execFileAsync('tmux', ['send-keys', '-t', destino, '-l', '--', teclas.texto], { timeout: 2000 });
      return;
    }
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

type RespuestaMala = RespuestaPromptTmux & { ok: false };

/**
 * Lo que comparten `responderPromptTmux` y `responderSeleccionCompuestaTmux`
 * antes de teclear nada: que el pane siga anotado como pendiente para esa
 * sesión, y que siga mostrando el mismo diálogo que vio la persona (se
 * vuelve a leer justo antes). Si cambió —lo contestaron desde la terminal, o
 * es otra pregunta— no se manda nada.
 */
async function validarPromptVigente(
  entrada: { sessionId: string; pane: string; promptId: string },
  dependencias: VigiaPromptsDependencias,
): Promise<{ ok: true; prompt: PromptTmux } | { ok: false; respuesta: RespuestaMala }> {
  const anotado = pendientes.get(entrada.pane);
  if (!anotado || anotado.sessionId !== entrada.sessionId || !NOMBRE_TMUX_PATTERN.test(entrada.pane)) {
    return { ok: false, respuesta: { ok: false, codigo: 'TMUX_PROMPT_UNKNOWN', mensaje: 'Esa sesión ya no tiene una pregunta pendiente.' } };
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
      respuesta: {
        ok: false,
        codigo: 'TMUX_PROMPT_STALE',
        mensaje: 'La pregunta cambió o ya la contestaron desde la terminal. No se mandó nada.',
      },
    };
  }

  return { ok: true, prompt: actual };
}

/**
 * Que todos vean el prompt resuelto sin esperar la próxima vuelta. Dos
 * veces: una casilla se tilda enseguida, pero cambiar de pestaña o abrir la
 * revisión tarda en dibujarse, y la tarjeta tiene que mostrar lo que quedó
 * en el pane de verdad, no lo que se mandó.
 */
function reprogramarRevision(dependencias: VigiaPromptsDependencias): void {
  for (const demora of [250, 1200]) {
    setTimeout(() => { void revisarPromptsTmux(dependencias); }, demora).unref?.();
  }
}

/** Contesta un prompt con la opción elegida (una tecla, o una tecla suelta del pie). */
export async function responderPromptTmux(
  entrada: { sessionId: string; pane: string; promptId: string; opcion?: number; tecla?: string; texto?: string },
  opciones: { antesDeEnviar?: () => Promise<void> } = {},
  dependencias: VigiaPromptsDependencias = dependenciasVigiaPorDefecto,
): Promise<RespuestaPromptTmux> {
  const vigente = await validarPromptVigente(entrada, dependencias);
  if (!vigente.ok) return vigente.respuesta;
  const actual = vigente.prompt;

  let teclas: TeclasTmux;
  if (entrada.tecla !== undefined) {
    // Una tecla suelta, solo si el pie del diálogo la ofrece ahora.
    const tecla = actual.teclas.find((ofrecida) => ofrecida.tecla === entrada.tecla);
    if (!tecla) {
      return { ok: false, codigo: 'TMUX_PROMPT_BAD_OPTION', mensaje: 'Esa tecla no hace nada en este diálogo.' };
    }
    // ←/→ cambian de pestaña solo desde una opción común: parado en el campo
    // libre mueven el cursor del texto, y en "Next"/"Submit" no hacen nada
    // (medido el 5-oct). Antes se sube a la primera, que nunca es ninguna de esas.
    const subir = (tecla.tecla === 'Left' || tecla.tecla === 'Right') && actual.pestanas.length > 1
      ? Array.from({ length: Math.max(actual.seleccionada, 0) }, () => 'Up')
      : [];
    teclas = { tipo: 'teclas', teclas: [...subir, tecla.tecla] };
  } else {
    const opcion = entrada.opcion;
    if (opcion === undefined || !Number.isInteger(opcion) || opcion < 0 || opcion >= actual.opciones.length) {
      return { ok: false, codigo: 'TMUX_PROMPT_BAD_OPTION', mensaje: 'Esa opción no existe en la pregunta.' };
    }
    teclas = teclasParaOpcion(actual, opcion, entrada.texto ?? '');
    if ((teclas.tipo === 'libre' || teclas.tipo === 'escribir') && !teclas.texto) {
      return { ok: false, codigo: 'TMUX_PROMPT_BAD_OPTION', mensaje: 'Escribí la respuesta antes de mandarla.' };
    }
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

  reprogramarRevision(dependencias);
  return { ok: true };
}

/**
 * Contesta un AskUserQuestion de varias casillas de una: la tarjeta compone
 * toda la selección en el cliente (qué casillas quedan tildadas, y el texto
 * de la libre si la pide) y manda un solo pedido, en vez de un pedido por
 * clic — eso era lo que carreraba contra `TMUX_PROMPT_STALE` (Fase 9, paso
 * 2). La validación de vigencia es la misma que un clic suelto; lo que
 * cambia es que `teclasParaSeleccionCompuesta` calcula de una toda la
 * secuencia necesaria para llegar al estado pedido.
 */
export async function responderSeleccionCompuestaTmux(
  entrada: { sessionId: string; pane: string; promptId: string; seleccion: number[]; texto?: string },
  opciones: { antesDeEnviar?: () => Promise<void> } = {},
  dependencias: VigiaPromptsDependencias = dependenciasVigiaPorDefecto,
): Promise<RespuestaPromptTmux> {
  const vigente = await validarPromptVigente(entrada, dependencias);
  if (!vigente.ok) return vigente.respuesta;
  const actual = vigente.prompt;

  if (
    !Array.isArray(entrada.seleccion)
    || entrada.seleccion.some((indice) => !Number.isInteger(indice) || indice < 0 || indice >= actual.opciones.length)
  ) {
    return { ok: false, codigo: 'TMUX_PROMPT_BAD_OPTION', mensaje: 'Esa selección no existe en la pregunta.' };
  }

  const libreElegida = actual.opciones.find((opcion) => opcion.casilla && opcion.libre && entrada.seleccion.includes(opcion.indice));
  if (libreElegida && !(entrada.texto ?? '').trim()) {
    return { ok: false, codigo: 'TMUX_PROMPT_BAD_OPTION', mensaje: 'Escribí la respuesta antes de mandarla.' };
  }

  const teclas = teclasParaSeleccionCompuesta(actual, entrada.seleccion, entrada.texto ?? '');

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

  reprogramarRevision(dependencias);
  return { ok: true };
}

/**
 * Qué pantalla muestra el pane, para decirle a la persona por qué no se mandó
 * su mensaje en vez de una frase genérica:
 *
 * - `conversacion`: el cuadro de texto de la conversación, a la vista.
 * - `agentes`: la vista de agentes que abre `←` ("Your conversation moved to
 *   the background"). Tiene su propio cuadro, pero lo que se escribe ahí abre
 *   OTRA sesión: no es el cuadro de la conversación.
 * - `transcript`: el modo transcript (`ctrl+o`), sin cuadro.
 * - `dialogo`: un diálogo con pie de teclas que no se pudo leer como pregunta.
 * - `shell`: `claude` se cerró y el pane quedó en bash (`ct` hace `exec bash`).
 * - `vacia`: no dibujó nada todavía.
 * - `ilegible`: `capture-pane` falló (lo pone quien captura, no esta lectura).
 * - `otra`: ninguna de esas; `ultimaLinea` dice qué hay.
 *
 * Medidas en Claude Code 2.1.292 (7-oct, e2e/fixtures/panes/2.1.292/).
 */
export type VistaPaneTmux = 'conversacion' | 'agentes' | 'transcript' | 'dialogo' | 'shell' | 'vacia' | 'ilegible' | 'otra';

export type EstadoPaneTmux = {
  /** El diálogo abierto, si hay uno. */
  prompt: PromptTmux | null;
  /** El cuadro de texto de Claude Code, o `null` si no está a la vista (un formulario, `claude` cerrado). */
  cuadro: { texto: string } | null;
  vista: VistaPaneTmux;
  /** La última línea con texto del pane, recortada: lo que se le muestra a la persona si la vista es `otra`. */
  ultimaLinea: string;
};

// Las dos se reconocen por el pie (las últimas líneas), nunca por el texto de
// arriba: una conversación que las cite sigue siendo una conversación.
const VISTA_AGENTES = /\benter to return · space to reply\b/;
const VISTA_TRANSCRIPT = /Showing detailed transcript · ctrl\+o to toggle/;
// El prompt de bash: termina en `$` o `#` (el de `ct` parte la ruta larga en
// dos renglones, así que se mira solo el final).
const PROMPT_SHELL = /\S*[$#]$/;

function vistaDelPane(lineas: string[], cuadro: CuadroDeEntrada | null): VistaPaneTmux {
  const conTexto = lineas.filter((linea) => linea.trim());
  if (conTexto.length === 0) return 'vacia';
  const pie = conTexto.slice(-3);
  if (pie.some((linea) => VISTA_AGENTES.test(linea))) return 'agentes';
  if (pie.some((linea) => VISTA_TRANSCRIPT.test(linea))) return 'transcript';
  if (cuadro) return 'conversacion';
  const ultima = conTexto[conTexto.length - 1].trim();
  if (esPie(ultima)) return 'dialogo';
  if (PROMPT_SHELL.test(ultima)) return 'shell';
  return 'otra';
}

/** Lo que muestra el pane: si hay un diálogo y qué tiene escrito el cuadro de texto. Pura, sobre `capture-pane -p -e`. */
export function leerEstadoPane(pantalla: string): EstadoPaneTmux {
  const crudas = pantalla.replace(/\r/g, '').split('\n');
  const lineas = crudas.map((linea) => sinEscapes(linea).replace(/\s+$/, ''));
  const encontrado = ubicarCuadroDeEntrada(crudas);
  const vista = vistaDelPane(lineas, encontrado);
  // El cuadro de la vista de agentes manda el texto a una sesión nueva.
  const cuadro = vista === 'conversacion' && encontrado ? { texto: encontrado.texto } : null;
  const ultimaLinea = [...lineas].reverse().find((linea) => linea.trim())?.trim() ?? '';
  return { prompt: detectarPromptTmux(pantalla), cuadro, vista, ultimaLinea };
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
