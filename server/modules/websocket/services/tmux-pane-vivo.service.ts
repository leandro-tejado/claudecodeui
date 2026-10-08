import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { leerEstadoPane, sinEscapes } from '@/modules/websocket/services/tmux-prompt.service.js';

const execFileAsync = promisify(execFile);

/**
 * Lector del pane en vivo (Fase 7, Paso 4): mientras `tmux-bridge.service.ts`
 * detecta fin de turno leyendo el `.jsonl` (nunca `capture-pane`, salvo este
 * módulo), esto lee la PANTALLA del pane para mostrar, mientras el turno sigue
 * en curso, qué está haciendo Claude (`activity`) y el texto que está
 * escribiendo todavía (`stream_delta` de un borrador).
 *
 * Nunca es la fuente de verdad: si la pantalla no se reconoce, no emite nada y
 * la sesión sigue funcionando solo con el `.jsonl` (los Pasos 1-3 y 6-7 de
 * esta fase), que es lo único indispensable. Esto es, a propósito, la parte
 * que puede degradarse sin romper nada.
 *
 * Formato medido el 6-oct-2026 contra una sesión real (`claude --version`
 * 2.1.289) en los fixtures de `e2e/fixtures/panes/2.1.289/`:
 *
 *     ✻ Garnishing… (11s · ↓ 103 tokens)        ocupado, generando texto
 *     · Seasoning… (2s · thinking with high effort)   ocupado, pensando
 *     ✻ Baked for 36s · done 12:48 AM           libre (recién terminó)
 *
 * El glifo rota entre varios (✻✽✶✢·*) con cada tick; lo que separa "ocupado"
 * de "recién terminado" no es el glifo sino la elipsis: ocupado siempre
 * termina en "…", terminado queda en pasado ("Baked for Ns · done HH:MM") y
 * sin elipsis. No encontramos, en esta versión, el `(esc to interrupt)` del
 * enunciado de la fase como línea separada — la pantalla real lo absorbe en
 * el pie normal (`ctx ... · auto mode on`) en vez de remplazarlo.
 */

// Los seis glifos que se vieron rotar en capturas reales el 6-oct (versión
// 2.1.289): ✻✽✶✢·*. A propósito NO incluye "●" — es la viñeta de los bloques
// de la respuesta, y confundirla con el spinner la haría falso positivo en
// cualquier oración de la respuesta que termine con puntos suspensivos.
const GLIFOS_SPINNER = '[✻✽✶✢·*]';
// glifo + verbo + "…" + paréntesis. "Garnishing… (11s · ↓ 103 tokens)" o
// "Seasoning… (2s · thinking with high effort)". El paréntesis es obligatorio
// porque sin él ningún glifo suelto (p.ej. una viñeta "● " de la respuesta)
// cuenta como spinner.
const PATRON_SPINNER = new RegExp(`^${GLIFOS_SPINNER}\\s+(\\S.*?…\\s*\\([^)]*\\))\\s*$`, 'u');
// Una vez termina el turno, la misma línea queda en pasado: sin elipsis, con
// "done". No es spinner — es el resumen de "libre".
const PATRON_RAYA = /^[─▔━═]{8,}$/;

export type ActividadPane =
  | { kind: 'idle' }
  | { kind: 'thinking'; texto: string }
  | { kind: 'tool'; name: string; texto: string };

/**
 * Si la línea (ya sin el glifo líder) describe una tool en curso en vez de
 * "nomás pensando" — "Running 1 shell command…", "Waiting 8 seconds, then
 * listing files", o la línea `⎿` que le sigue con el comando. Deliberadamente
 * angosto: lo que no calza entra como 'thinking', nunca se inventa un nombre.
 */
function nombreDeToolActivo(lineasAntes: string[]): string | null {
  for (let i = lineasAntes.length - 1; i >= 0; i -= 1) {
    const linea = lineasAntes[i].trim();
    if (!linea) continue;
    const sinBullet = linea.replace(/^[●⎿]\s*/, '').trim();
    if (/^Ran\s+\d+\s+shell\s+command/i.test(sinBullet)) return null; // ya terminó, no es "en curso"
    if (/^(Running|Waiting)\b.+/i.test(sinBullet)) return sinBullet;
    if (/^\$\s+\S/.test(sinBullet)) return sinBullet; // la línea `⎿  $ comando`
    // Una línea de prosa común (la respuesta) corta la búsqueda: lo que haya
    // más arriba ya es de un paso anterior.
    if (sinBullet.length > 0) return null;
  }
  return null;
}

/**
 * Lee la actividad actual del pane. `null` cuando la pantalla no se reconoce
 * (diálogo abierto, o ningún cuadro de Claude Code a la vista): degradar a
 * "no emitir nada" es a propósito, ver el comentario de arriba del archivo.
 */
export function leerActividadPane(pantalla: string): ActividadPane | null {
  const estado = leerEstadoPane(pantalla);
  if (estado.prompt) return null; // diálogo: ni ocupado ni libre, no se opina
  if (!estado.cuadro) return null; // pantalla no reconocida

  const lineas = sinEscapes(pantalla).replace(/\r/g, '').split('\n').map((linea) => linea.replace(/\s+$/, ''));
  let fin = lineas.length - 1;
  while (fin >= 0 && !lineas[fin].trim()) fin -= 1;
  // El cuadro está debajo de la última raya antes del pie; la línea del
  // spinner, si hay, vive arriba de esa raya.
  let rayaSuperiorCuadro = -1;
  let rayas = 0;
  for (let i = fin; i >= 0; i -= 1) {
    if (PATRON_RAYA.test(lineas[i].trim())) {
      rayas += 1;
      if (rayas === 2) { rayaSuperiorCuadro = i; break; }
    }
  }
  if (rayaSuperiorCuadro < 1) return { kind: 'idle' };

  for (let i = rayaSuperiorCuadro - 1; i >= 0 && rayaSuperiorCuadro - i <= 6; i -= 1) {
    const m = PATRON_SPINNER.exec(lineas[i].trim());
    if (!m) continue;
    const texto = m[1];
    if (/\bthinking\b/i.test(texto)) return { kind: 'thinking', texto };
    const nombre = nombreDeToolActivo(lineas.slice(Math.max(0, i - 4), i));
    if (nombre) return { kind: 'tool', name: nombre, texto };
    return { kind: 'thinking', texto };
  }
  return { kind: 'idle' };
}

// Líneas de contabilidad de tools que no son texto de la respuesta: no
// forman parte del borrador aunque estén dentro del rango que se extrae.
//
// 8-oct: tres agregados nuevos de la pantalla real que esta función no
// reconocía y se colaban enteros en el borrador —
//
//   - el recuadro que Claude Code deja al contestar un AskUserQuestion
//     ("User answered Claude's questions:" + la línea `⎿  · pregunta →
//     respuesta`, Fase 7 del chat);
//   - el aviso de cuota semanal ("You've used NN% of your weekly limit ·
//     resets ..."), que aparece recién cuando la cuota 7d pasa el 75% —
//     no existía en ningún fixture hasta hoy;
//   - la statusline con el prefijo de cuenta de multi-cuenta (6-oct):
//     "personal · ctx 5% · ..." en vez de "ctx 5% · ...", que el regex de
//     `ctx` exigía al principio de la línea y por eso dejaba de matchear.
function esLineaDeContabilidad(linea: string): boolean {
  const t = linea.trim();
  if (!t) return false;
  const sinBullet = t.replace(/^[●⎿]\s*/, '').trim();
  if (PATRON_RAYA.test(t)) return true;
  if (PATRON_SPINNER.test(t)) return true;
  if (/^Ran\s+\d+\s+shell\s+command/i.test(sinBullet)) return true;
  if (/^(Running|Waiting)\b.+/i.test(sinBullet)) return true;
  if (/^\$\s+\S/.test(sinBullet)) return true;
  // Prefijo de cuenta opcional ("personal · ") antes de "ctx NN% · ...".
  if (/^(?:\S+\s*·\s*)?ctx\s+\d+%/i.test(t)) return true;
  if (/auto mode on|manual mode on/i.test(t)) return true;
  if (/^●?\s*high\s*·\s*\/effort$/i.test(t)) return true;
  // El cuadro de entrada actual, vacío: sólo el glifo, sin texto tipeado
  // todavía. No es respuesta — es el prompt en blanco esperando al usuario.
  if (t === '❯') return true;
  // El resumen que deja un AskUserQuestion ya contestado, y su aviso de
  // cuota semanal cuando lo trae pegado (ver comentario de arriba).
  if (/^User answered\b.*questions?:?\s*$/i.test(t)) return true;
  if (/^·\s.+→/.test(sinBullet)) return true;
  if (/^You've used\s+\d+%\s+of your\s+\S+\s+limit\b/i.test(t)) return true;
  return false;
}

/**
 * El texto de la respuesta en curso (lo que va abajo del último prompt
 * ecoado del usuario), para el borrador (`stream_delta`). `null` si no hay
 * nada reconocible — un diálogo abierto, una pantalla sin el cuadro de
 * Claude Code, o ninguna fila de usuario a la vista.
 */
export function extraerBorrador(pantalla: string): string | null {
  const estado = leerEstadoPane(pantalla);
  if (estado.prompt || !estado.cuadro) return null;

  const lineas = sinEscapes(pantalla).replace(/\r/g, '').split('\n').map((linea) => linea.replace(/\s+$/, ''));
  let desde = -1;
  for (let i = lineas.length - 1; i >= 0; i -= 1) {
    if (/^❯\s+\S/.test(lineas[i])) { desde = i; break; }
  }
  if (desde < 0) return null;

  // El prompt ecoado puede envolver en varias líneas — ninguna raya lo separa
  // de lo que sigue, y sólo la primera empieza con "❯" — así que la primera
  // línea en blanco después del ancla cierra la cita. Sin este salto, las
  // líneas de continuación del prompt del usuario se leían como si fueran
  // parte de la respuesta en curso (8-oct: "el final del prompt del usuario"
  // colándose en el borrador).
  let inicio = desde + 1;
  while (inicio < lineas.length && lineas[inicio].trim().length > 0) inicio += 1;
  inicio += 1;

  const texto = lineas
    .slice(inicio)
    .filter((linea) => linea.trim().length > 0 && !esLineaDeContabilidad(linea))
    .map((linea) => linea.replace(/^●\s*/, ''))
    .join('\n')
    .trim();
  return texto.length > 0 ? texto : null;
}

export type PaneVivoDependencias = {
  capturarPantalla: (nombreSesion: string) => Promise<string>;
};

// Mismo charset que exige tmux-bridge.service.ts: una sesión válida nunca
// tiene otra cosa, y esto nunca ejecuta `tmux` con un nombre que no lo cumpla.
const NOMBRE_TMUX_PATTERN = /^[A-Za-z0-9_-]+$/;

const dependenciasPorDefecto: PaneVivoDependencias = {
  capturarPantalla: async (nombreSesion) => {
    if (!NOMBRE_TMUX_PATTERN.test(nombreSesion)) {
      throw new Error(`nombre de sesion tmux fuera de charset: "${nombreSesion}"`);
    }
    const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-e', '-t', `=${nombreSesion}:`], { timeout: 2000 });
    return stdout;
  },
};

export type EventoPaneVivo =
  | { kind: 'activity'; sessionId: string; activityKind: 'thinking' | 'tool'; toolName?: string; texto: string; timestamp: string }
  | { kind: 'activity'; sessionId: string; activityKind: undefined; idle: true; timestamp: string }
  | { kind: 'stream_delta'; sessionId: string; messageId: string; blockIndex: 0; content: string; timestamp: string }
  | { kind: 'stream_reemplazo'; sessionId: string; messageId: string; blockIndex: 0; timestamp: string };

const INTERVALO_MS = 400;

type EstadoVivo = {
  // `null` hasta que el primer `capture-pane` real vuelve — no "idle" por
  // default. 6-oct: con "idle" de arranque, un `chat.subscribe` que llega
  // antes del primer poll (p. ej. recién recargada la página, el `ws`
  // anterior se fue y se desuscribió, y éste es el primer suscriptor de
  // nuevo) leía `ultimaActividadConocida() === {kind:'idle'}` y el ack
  // decía `isProcessing: false` con el pane realmente ocupado — el check
  // "recarga a mitad de un turno" de la Fase 7 lo encontró en vivo.
  ultimaActividad: ActividadPane | null;
  ultimoBorrador: string | null;
  timer: ReturnType<typeof setInterval>;
  suscriptores: Set<unknown>;
};

const estadosPorProviderSessionId = new Map<string, EstadoVivo>();

/** El `messageId` sintético del borrador de una sesión — Fase 4, mismo por sesión. */
export function messageIdBorrador(providerSessionId: string): string {
  return `tmux-borrador:${providerSessionId}`;
}

/**
 * Última actividad conocida, para el ack de `chat.subscribe` (Paso 7). `null`
 * sin dato real todavía — nadie suscripto, o recién suscripto y el primer
 * `capture-pane` (hasta 400 ms) no volvió todavía. A propósito NUNCA
 * `{kind:'idle'}` como valor por default: el llamador tiene que caer a su
 * propio heurístico (`estaOcupadoTmux`) en ese caso, no asumir "libre".
 */
export function ultimaActividadConocida(providerSessionId: string | null | undefined): ActividadPane | null {
  if (!providerSessionId) return null;
  return estadosPorProviderSessionId.get(providerSessionId)?.ultimaActividad ?? null;
}

async function revisar(
  providerSessionId: string,
  nombreSesion: string,
  sessionId: string,
  emitir: (evento: EventoPaneVivo) => void,
  dependencies: PaneVivoDependencias,
): Promise<void> {
  const estadoVivo = estadosPorProviderSessionId.get(providerSessionId);
  if (!estadoVivo) return; // se desuscribieron mientras esta vuelta esperaba el capture-pane

  let pantalla: string;
  try {
    pantalla = await dependencies.capturarPantalla(nombreSesion);
  } catch {
    return; // pane recién creado, o se murió: tmux-bridge.service.ts (JSONL) sigue cubriendo la sesión
  }

  const actividad = leerActividadPane(pantalla);
  if (actividad === null) return; // diálogo o pantalla no reconocida: no se opina, se degrada

  const timestamp = new Date().toISOString();
  const previa = estadoVivo.ultimaActividad;
  if (actividad.kind === 'idle') {
    if (estadoVivo.ultimoBorrador !== null) {
      emitir({ kind: 'stream_reemplazo', sessionId, messageId: messageIdBorrador(providerSessionId), blockIndex: 0, timestamp });
      estadoVivo.ultimoBorrador = null;
    }
    // `previa === null` (primer poll de esta suscripción): no se sabe si
    // antes estaba ocupado, así que no hay transición que avisar.
    if (previa !== null && previa.kind !== 'idle') {
      emitir({ kind: 'activity', sessionId, activityKind: undefined, idle: true, timestamp });
    }
  } else {
    emitir({
      kind: 'activity',
      sessionId,
      activityKind: actividad.kind,
      ...(actividad.kind === 'tool' ? { toolName: actividad.name } : {}),
      texto: actividad.texto,
      timestamp,
    });
    const borrador = extraerBorrador(pantalla);
    if (borrador !== null && borrador !== estadoVivo.ultimoBorrador) {
      estadoVivo.ultimoBorrador = borrador;
      emitir({ kind: 'stream_delta', sessionId, messageId: messageIdBorrador(providerSessionId), blockIndex: 0, content: borrador, timestamp });
    }
  }
  estadoVivo.ultimaActividad = actividad;
}

/**
 * Suscribe a un cliente (el `token` identifica de cuál: el `WebSocket`) a la
 * actividad en vivo de una sesión puenteada. Arranca el `capture-pane` cada
 * 400 ms la primera vez que alguien se suscribe a esa sesión; lo apaga en
 * cuanto el último se va — "Peligros" de la Fase 7: con 10 sesiones sin esto
 * serían 25 `capture-pane` por segundo sin que nadie mire ninguna.
 *
 * Devuelve la función de baja.
 */
export function suscribirPaneVivo(
  token: unknown,
  providerSessionId: string,
  nombreSesion: string,
  sessionId: string,
  emitir: (evento: EventoPaneVivo) => void,
  dependencies: PaneVivoDependencias = dependenciasPorDefecto,
): () => void {
  let estadoVivo = estadosPorProviderSessionId.get(providerSessionId);
  if (!estadoVivo) {
    const timer = setInterval(() => {
      void revisar(providerSessionId, nombreSesion, sessionId, emitir, dependencies);
    }, INTERVALO_MS);
    timer.unref?.();
    estadoVivo = { ultimaActividad: null, ultimoBorrador: null, timer, suscriptores: new Set() };
    estadosPorProviderSessionId.set(providerSessionId, estadoVivo);
  }
  estadoVivo.suscriptores.add(token);

  return () => {
    const actual = estadosPorProviderSessionId.get(providerSessionId);
    if (!actual) return;
    actual.suscriptores.delete(token);
    if (actual.suscriptores.size === 0) {
      clearInterval(actual.timer);
      estadosPorProviderSessionId.delete(providerSessionId);
    }
  };
}

/** Solo para tests. */
export function _resetPaneVivoParaTests(): void {
  for (const estado of estadosPorProviderSessionId.values()) {
    clearInterval(estado.timer);
  }
  estadosPorProviderSessionId.clear();
}

export const tmuxPaneVivoService = {
  leerActividadPane,
  extraerBorrador,
  messageIdBorrador,
  ultimaActividadConocida,
  suscribirPaneVivo,
};
