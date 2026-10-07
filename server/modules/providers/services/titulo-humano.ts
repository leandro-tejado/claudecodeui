import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Título de sesión para una persona, derivado del primer mensaje con una
 * regla determinista — sin gastar cuota en un modelo (pedido del 07-oct).
 *
 * Antes la barra mostraba el mensaje entero cortado (`/aos-core:ejecutar-plan
 * plans/06-octubre-vps-multi-cuenta.md — Leandro ya aprobó…`). Ahora:
 *
 * - Un comando con un plan (`/x plans/DD-mes-titulo.md`) toma el `# título`
 *   del plan, y ese nombre es `definitivo`: el `ai-title` que Claude Code
 *   escribe después no lo pisa.
 * - Cualquier otro mensaje pierde el comando `/skill`, las rutas, el código,
 *   las URLs, las `CLAVE=valor` y el relleno del arranque ("hola", "Leandro
 *   ya aprobó"), y se queda con la primera frase, en 50 caracteres como
 *   mucho. No es `definitivo`: si después llega el `ai-title`, lo reemplaza
 *   una vez.
 */

export type TituloHumano = { titulo: string; definitivo: boolean };

export type OpcionesTituloHumano = {
  /** Directorio de la sesión: contra él se resuelve una ruta de plan relativa. */
  cwd?: string | null;
  /** Solo para tests: lee el plan sin tocar el disco. `null` si no se puede. */
  leerArchivo?: (ruta: string) => string | null;
};

const MAX_LARGO = 50;

const RELLENO_INICIAL = [
  'leandro ya aprob[oó]',
  'ya aprob[eé]',
  'ya est[aá] aprobado',
  'aprobado',
  'c[oó]mo vamos',
  'buen d[ií]a',
  'buenas',
  'hola',
  'che',
  'dale',
  'bueno',
  'okay',
  'ok',
  'listo',
  'perfecto',
  'genial',
  'gracias',
  'por favor',
  'porfa',
];
const RELLENO_INICIAL_REGEX = new RegExp(`^(?:${RELLENO_INICIAL.join('|')})(?=[\\s,.!:;¡?]|$)[\\s,.!:;?]*`, 'i');

// Palabras que no pueden cerrar un título: quedan colgando cuando se corta.
const CONECTORES_FINALES = new Set([
  'y', 'o', 'e', 'u', 'de', 'del', 'con', 'para', 'que', 'la', 'el', 'los', 'las',
  'en', 'a', 'al', 'por', 'un', 'una', 'sin', 'sobre', 'como',
]);

function leerArchivoDelDisco(ruta: string): string | null {
  try {
    return readFileSync(ruta, 'utf8').slice(0, 4_000);
  } catch {
    return null;
  }
}

function quitarConectoresFinales(texto: string): string {
  const palabras = texto.replace(/[\s,;:.\-—–]+$/, '').split(/\s+/);
  while (palabras.length > 1 && CONECTORES_FINALES.has(palabras[palabras.length - 1].toLowerCase())) {
    palabras.pop();
  }
  return palabras.join(' ').replace(/[\s,;:.\-—–]+$/, '');
}

function recortar(texto: string): string {
  const limpio = quitarConectoresFinales(texto.replace(/\s+/g, ' ').trim());
  if (limpio.length <= MAX_LARGO) {
    return limpio;
  }
  let corto = '';
  for (const palabra of limpio.split(' ')) {
    const siguiente = corto ? `${corto} ${palabra}` : palabra;
    if (siguiente.length > MAX_LARGO - 1) break;
    corto = siguiente;
  }
  // Una sola palabra más larga que el máximo: se corta a lo bruto.
  return `${quitarConectoresFinales(corto || limpio.slice(0, MAX_LARGO - 1))}…`;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function tituloDePlan(ruta: string, opciones: OpcionesTituloHumano): string {
  const absoluta = path.isAbsolute(ruta) ? ruta : opciones.cwd ? path.resolve(opciones.cwd, ruta) : null;
  const contenido = absoluta ? (opciones.leerArchivo ?? leerArchivoDelDisco)(absoluta) : null;
  const h1 = contenido ? /^#\s+(.+?)\s*#*\s*$/m.exec(contenido)?.[1] : undefined;
  const limpio = h1?.replace(/[*_`]/g, '').trim();
  if (limpio) {
    return recortar(limpio);
  }
  // Sin el archivo: el nombre del plan, sin la fecha (`DD-mes-`).
  const base = path.basename(ruta, '.md').replace(/^\d{1,2}-[a-záéíóú]+-/i, '').replace(/[-_]+/g, ' ');
  return recortar(`Plan: ${base}`);
}

/** Limpia un mensaje en prosa y se queda con su primera frase. */
function tituloDeProsa(texto: string): string | null {
  let limpio = texto
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    // Rutas: cualquier token con una barra (`~/x/y`, `src/a.ts`, `/home/...`).
    .replace(/(^|\s)[^\s/]*\/\S*/g, '$1')
    .replace(/(^|\s)[A-Z][A-Z0-9_]*=\S*/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();

  for (let previo = ''; previo !== limpio; ) {
    previo = limpio;
    limpio = limpio.replace(RELLENO_INICIAL_REGEX, '').trim();
  }

  const frase = limpio
    .split(/(?<=[.!?;:])\s+|\s[—–]\s|\n+/)
    .map((parte) => parte.trim())
    .find((parte) => /[\p{L}\p{N}]/u.test(parte));
  if (!frase) {
    return null;
  }

  // "Prueba de permisos, hacé esto…": antes de la primera coma, si eso solo
  // ya dice algo (3 a 8 palabras).
  let titulo = frase;
  const antesDeLaComa = frase.split(/,\s/)[0];
  const palabras = antesDeLaComa.split(/\s+/).length;
  if (antesDeLaComa !== frase && palabras >= 3 && palabras <= 8) {
    titulo = antesDeLaComa;
  }

  titulo = recortar(titulo.replace(/[.!?;:]+$/, ''));
  return titulo ? capitalizar(titulo) : null;
}

export function tituloHumano(texto: string, opciones: OpcionesTituloHumano = {}): TituloHumano | null {
  let mensaje = (texto ?? '').trim();
  if (!mensaje) {
    return null;
  }

  // Así queda un slash command en el transcript de Claude Code.
  const comandoTranscript = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(mensaje);
  if (comandoTranscript) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(mensaje)?.[1] ?? '';
    mensaje = `/${comandoTranscript[1]} ${args}`.trim();
  }

  // Modo bash del CLI (`! comando`): el comando, hasta el primer `;`.
  if (mensaje.startsWith('!')) {
    const comando = mensaje.slice(1).split('\n')[0].split(';')[0].trim();
    return comando ? { titulo: recortar(`Comando: ${comando}`), definitivo: false } : null;
  }

  const slash = /^\/([A-Za-z0-9_.:-]+)(?:\s+([\s\S]*))?$/.exec(mensaje);
  if (slash) {
    const args = slash[2] ?? '';
    const plan = /(?:^|\s)((?:[^\s`'"]*\/)?plans\/[^\s`'"/]+\.md)(?=$|[\s,.;:)])/.exec(args);
    if (plan) {
      return { titulo: tituloDePlan(plan[1], opciones), definitivo: true };
    }
    const deLosArgumentos = tituloDeProsa(args);
    if (deLosArgumentos) {
      return { titulo: deLosArgumentos, definitivo: false };
    }
    // Sin argumentos que digan algo: el comando, sin el namespace del plugin.
    const nombre = slash[1].split(':').pop()!.replace(/[-_.]+/g, ' ').trim();
    return nombre ? { titulo: capitalizar(recortar(nombre)), definitivo: false } : null;
  }

  const titulo = tituloDeProsa(mensaje);
  return titulo ? { titulo, definitivo: false } : null;
}
