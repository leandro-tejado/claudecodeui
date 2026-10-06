import { execFile } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { AppError } from '@/shared/utils.js';

/**
 * Cuentas de IA del VPS (plans/06-octubre-vps-multi-cuenta.md, Fase 3).
 *
 * El registro es `~/workspace-leandro/.claude/bin/cuentas.json` (ruta
 * configurable con `AOS_CUENTAS_JSON`): dice QUE cuentas hay y DONDE vive la
 * credencial de cada una, nunca el valor. Este modulo es el unico lugar del
 * servidor que abre ese archivo de credencial, y lo hace solo para sacar
 * `CLAUDE_CODE_OAUTH_TOKEN`.
 *
 * REGLA 5: el token nunca sale de aca hacia una respuesta HTTP, un websocket,
 * un log ni un mensaje de error. Los errores nombran el id de la cuenta y la
 * ruta del archivo, jamas su contenido. Lo unico que ve el resto del servidor
 * es un entorno de proceso (`entornoParaCuenta`) o una linea de shell que
 * lee el archivo en el proceso hijo (`prefijoShellDeCuenta`).
 */

const execFileAsync = promisify(execFile);

/**
 * La cuenta con la que ya corre el proceso del servidor: su token viene del
 * `EnvironmentFile` de systemd, asi que elegirla NO pisa nada. Es tambien la
 * unica cuya cuota vive en `cuota.json` (el resto en `cuota/<id>.json`).
 */
export const CUENTA_DEL_PROCESO = 'optimum';

const VARIABLE_TOKEN = 'CLAUDE_CODE_OAUTH_TOKEN';
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

type EntradaRegistro = {
  id?: unknown;
  proveedor?: unknown;
  plan?: unknown;
  credencial?: unknown;
  defecto?: unknown;
  uso?: unknown;
};

export type Cuenta = {
  id: string;
  proveedor: string;
  plan: string | null;
  defecto: boolean;
  uso: string | null;
  /** Ruta ya expandida del archivo de credencial; solo para uso interno del servidor. */
  credencial: string | null;
};

/** Lo unico que viaja al frontend: nunca la ruta ni el valor de la credencial. */
export type CuentaPublica = {
  id: string;
  plan: string | null;
  defecto: boolean;
  uso: string | null;
  /** El archivo de credencial existe. La cuenta del proceso siempre esta disponible. */
  disponible: boolean;
};

export function rutaRegistroCuentas(): string {
  return process.env.AOS_CUENTAS_JSON
    || path.join(os.homedir(), 'workspace-leandro', '.claude', 'bin', 'cuentas.json');
}

function expandirRuta(ruta: string): string {
  if (ruta === '~') return os.homedir();
  if (ruta.startsWith('~/')) return path.join(os.homedir(), ruta.slice(2));
  return ruta;
}

/** Un id que no cumple el charset nunca llega a una ruta de archivo ni a una linea de shell. */
export function esIdDeCuentaValido(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

function cuentaPorDefectoDelProceso(): Cuenta {
  return {
    id: CUENTA_DEL_PROCESO,
    proveedor: 'anthropic-oauth',
    plan: null,
    defecto: true,
    uso: null,
    credencial: null,
  };
}

/**
 * Las cuentas del registro. Sin registro legible queda solo la del proceso:
 * es la unica que se puede afirmar sin leer nada, y cualquier otro id va a
 * fallar con `CUENTA_DESCONOCIDA` en vez de caer en silencio a esta.
 */
export function listarCuentasInternas(): Cuenta[] {
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(rutaRegistroCuentas(), 'utf8'));
  } catch {
    return [cuentaPorDefectoDelProceso()];
  }

  const lista = (crudo as { cuentas?: unknown } | null)?.cuentas;
  if (!Array.isArray(lista)) return [cuentaPorDefectoDelProceso()];

  const cuentas: Cuenta[] = [];
  for (const item of lista as EntradaRegistro[]) {
    if (!esIdDeCuentaValido(item?.id)) continue;
    cuentas.push({
      id: item.id,
      proveedor: typeof item.proveedor === 'string' ? item.proveedor : 'anthropic-oauth',
      plan: typeof item.plan === 'string' ? item.plan : null,
      defecto: item.defecto === true,
      uso: typeof item.uso === 'string' ? item.uso : null,
      credencial: typeof item.credencial === 'string' ? expandirRuta(item.credencial) : null,
    });
  }

  if (!cuentas.some((cuenta) => cuenta.id === CUENTA_DEL_PROCESO)) {
    cuentas.unshift(cuentaPorDefectoDelProceso());
  }
  return cuentas;
}

function archivoExiste(ruta: string | null): boolean {
  if (!ruta) return false;
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
}

export function listarCuentas(): CuentaPublica[] {
  return listarCuentasInternas().map((cuenta) => ({
    id: cuenta.id,
    plan: cuenta.plan,
    defecto: cuenta.defecto,
    uso: cuenta.uso,
    disponible: cuenta.id === CUENTA_DEL_PROCESO || archivoExiste(cuenta.credencial),
  }));
}

/** `null`/vacio es la cuenta por defecto; un id fuera del registro es un error claro, nunca optimum. */
export function resolverCuenta(id: string | null | undefined): Cuenta {
  const pedido = typeof id === 'string' && id.trim() ? id.trim() : CUENTA_DEL_PROCESO;
  const cuenta = esIdDeCuentaValido(pedido)
    ? listarCuentasInternas().find((candidata) => candidata.id === pedido)
    : undefined;
  if (!cuenta) {
    throw new AppError(
      `La cuenta "${pedido.slice(0, 40)}" no existe en el registro de cuentas.`,
      { code: 'CUENTA_DESCONOCIDA', statusCode: 400 },
    );
  }
  return cuenta;
}

/** Valida el id y devuelve su forma canonica; lanza `CUENTA_DESCONOCIDA` si no existe. */
export function validarCuenta(id: string | null | undefined): string {
  return resolverCuenta(id).id;
}

function extraerToken(contenido: string): string | null {
  for (const linea of contenido.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?CLAUDE_CODE_OAUTH_TOKEN\s*=\s*(.*?)\s*$/.exec(linea);
    if (!match) continue;
    let valor = match[1];
    if (
      valor.length >= 2
      && ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'")))
    ) {
      valor = valor.slice(1, -1);
    }
    return valor.length > 0 ? valor : null;
  }
  return null;
}

/**
 * El token de una cuenta, leido del archivo que declara el registro. Solo para
 * inyectarlo en el entorno de un proceso hijo desde este mismo servidor.
 */
function leerToken(cuenta: Cuenta): string {
  if (!cuenta.credencial) {
    throw new AppError(
      `La cuenta "${cuenta.id}" no declara un archivo de credencial en el registro.`,
      { code: 'CUENTA_SIN_CREDENCIAL', statusCode: 409 },
    );
  }

  let contenido: string;
  try {
    contenido = readFileSync(cuenta.credencial, 'utf8');
  } catch {
    throw new AppError(
      `Falta la credencial de la cuenta "${cuenta.id}" (${cuenta.credencial}). Se da de alta con \`cuenta alta ${cuenta.id}\`.`,
      { code: 'CUENTA_SIN_CREDENCIAL', statusCode: 409 },
    );
  }

  const token = extraerToken(contenido);
  if (!token) {
    throw new AppError(
      `El archivo de la cuenta "${cuenta.id}" (${cuenta.credencial}) no trae ${VARIABLE_TOKEN}.`,
      { code: 'CUENTA_SIN_CREDENCIAL', statusCode: 409 },
    );
  }
  return token;
}

/**
 * Valida que `idCuenta` exista Y que se pueda usar (su archivo de credencial
 * trae el token), y devuelve el id canonico. Es lo que corre al CREAR una
 * sesion: mejor un error claro ahi que un turno que falla despues. La cuenta
 * del proceso no necesita archivo.
 */
export function asegurarCuentaUsable(idCuenta: string | null | undefined): string {
  const cuenta = resolverCuenta(idCuenta);
  if (cuenta.id !== CUENTA_DEL_PROCESO) leerToken(cuenta);
  return cuenta.id;
}

/**
 * El entorno con el que corre un turno del SDK para `idCuenta`.
 *
 * - Cuenta del proceso (o sin cuenta): devuelve `base` tal cual — el proceso
 *   ya trae su token, no se pisa nada.
 * - Cualquier otra: `base` mas el token de esa cuenta y `AOS_CUENTA`. Un id
 *   desconocido o una credencial ausente lanzan, nunca vuelven a la cuenta
 *   por defecto sin avisar.
 */
export function entornoParaCuenta(
  base: NodeJS.ProcessEnv,
  idCuenta: string | null | undefined,
): NodeJS.ProcessEnv {
  const cuenta = resolverCuenta(idCuenta);
  if (cuenta.id === CUENTA_DEL_PROCESO) return base;
  return { ...base, [VARIABLE_TOKEN]: leerToken(cuenta), AOS_CUENTA: cuenta.id };
}

/**
 * Para el `bash -ic` de un pane de tmux: va DESPUES del `.bashrc` (que carga
 * el token por defecto), asi que el token de la cuenta lo pisa — el mismo
 * mecanismo que `claude-tmux --cuenta`. El token nunca pasa por el comando:
 * el pane lee el archivo por su cuenta. Vacio para la cuenta del proceso.
 */
export function prefijoShellDeCuenta(idCuenta: string | null | undefined): string {
  const cuenta = resolverCuenta(idCuenta);
  if (cuenta.id === CUENTA_DEL_PROCESO) return '';

  // Valida que la credencial exista y traiga el token antes de abrir el pane:
  // un pane que arranca sin login es peor que un error claro ahora.
  leerToken(cuenta);

  const ruta = cuenta.credencial as string;
  if (!/^[A-Za-z0-9_./@:+-]+$/.test(ruta)) {
    throw new AppError(
      `La ruta de la credencial de "${cuenta.id}" tiene caracteres que no se aceptan en un comando.`,
      { code: 'CUENTA_SIN_CREDENCIAL', statusCode: 409 },
    );
  }
  return `set -a; . '${ruta}'; set +a; export AOS_CUENTA=${cuenta.id}; `;
}

/** `cuota.json` para la cuenta del proceso; `cuota/<id>.json` junto a el para el resto. */
export function rutaArchivoCuota(idCuenta: string | null | undefined, rutaBase: string): string {
  const id = idCuenta && idCuenta.trim() ? idCuenta.trim() : CUENTA_DEL_PROCESO;
  if (id === CUENTA_DEL_PROCESO) return rutaBase;
  if (!esIdDeCuentaValido(id)) {
    throw new AppError(`Id de cuenta invalido: "${String(idCuenta).slice(0, 40)}".`, { code: 'CUENTA_DESCONOCIDA', statusCode: 400 });
  }
  return path.join(path.dirname(rutaBase), 'cuota', `${id}.json`);
}

const TMUX_NOMBRE_PATTERN = /^[A-Za-z0-9_-]+$/;
const CACHE_TMUX_MS = 5000;
let cacheTmux: { cuentas: Map<string, string> | null; leidoEn: number } | null = null;

/**
 * `nombre de sesion -> @cuenta` de TODAS las sesiones vivas, en una sola
 * llamada a tmux (cacheada unos segundos: el sidebar pregunta por cada fila).
 * `null` si tmux no responde o no hay servidor.
 *
 * Se lista en vez de `show-options -t =<n>: -qv @cuenta` porque con `-q`
 * tmux calla tambien cuando la sesion NO existe y devuelve vacio, y vacio
 * significa optimum: una sesion muerta pasaba por una de optimum.
 */
async function leerCuentasDeTmux(): Promise<Map<string, string> | null> {
  const ahora = Date.now();
  if (cacheTmux && ahora - cacheTmux.leidoEn < CACHE_TMUX_MS) return cacheTmux.cuentas;

  let cuentas: Map<string, string> | null;
  try {
    const { stdout } = await execFileAsync(
      'tmux',
      ['list-sessions', '-F', '#{session_name}\t#{@cuenta}'],
      { timeout: 2_000 },
    );
    cuentas = new Map();
    for (const linea of stdout.split('\n')) {
      if (!linea.trim()) continue;
      const [nombre, marca = ''] = linea.replace(/\r$/, '').split('\t');
      const valor = marca.trim();
      cuentas.set(nombre, valor !== '' && esIdDeCuentaValido(valor) ? valor : CUENTA_DEL_PROCESO);
    }
  } catch {
    cuentas = null;
  }
  cacheTmux = { cuentas, leidoEn: ahora };
  return cuentas;
}

/**
 * La cuenta de una sesion de tmux: su `@cuenta` (vacio = la cuenta del
 * proceso). `null` si la sesion no existe o tmux no responde — ausente no es
 * optimum.
 */
export async function cuentaDeTmux(nombre: string): Promise<string | null> {
  if (!TMUX_NOMBRE_PATTERN.test(nombre)) return null;
  const cuentas = await leerCuentasDeTmux();
  return cuentas?.get(nombre) ?? null;
}

/** Solo para tests. */
export function _vaciarCacheTmuxParaTests(): void {
  cacheTmux = null;
}
