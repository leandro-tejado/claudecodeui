import { execFileSync } from 'node:child_process';

/**
 * Fase 8 de `09-octubre-rediseno-vista-principal.md`: los servicios del VPS
 * agrupados por exposición, para la vista «Servicios». Solo lectura: corre
 * `ss -tlnpH` y `tailscale serve status` y no toca nada.
 *
 * Los parsers van separados de la ejecución para que los tests les pasen el
 * texto real de los comandos en vez de levantar puertos.
 */

export type Exposicion = 'publico' | 'tailnet' | 'local';

export type Escucha = { direccion: string; puerto: number; proceso: string | null };

/** Una ruta de `tailscale serve`: el puerto de afuera y el interno al que apunta. */
export type RutaServe = { externo: number; interno: number; funnel: boolean };

export type Servicio = {
  puerto: number;
  nombre: string;
  proceso: string | null;
  exposicion: Exposicion;
  /** Por dónde se entra desde afuera (`:8446`), si `tailscale serve` lo publica. */
  entrada: string | null;
};

export type ServiciosSnapshot = { servicios: Servicio[]; error: string | null };

/** Los que tienen nombre en `~/CLAUDE.md`; el resto cae al nombre del proceso o a «sin nombre». */
const NOMBRES: Record<number, string> = {
  22: 'sshd',
  3001: 'cloudcli',
  3100: 'servidor-code',
  3101: 'servidor-code-estudio',
  3200: 'norte',
  7681: 'ttyd',
};

// DNS del sistema: escucha siempre y no es un servicio de nadie.
const IGNORADOS = new Set([53]);

export function parsearSs(texto: string): Escucha[] {
  const escuchas: Escucha[] = [];
  for (const linea of texto.split('\n')) {
    const columnas = linea.trim().split(/\s+/);
    if (columnas[0] !== 'LISTEN' || columnas.length < 4) continue;
    const local = columnas[3];
    const corte = local.lastIndexOf(':');
    const puerto = Number(local.slice(corte + 1));
    if (!Number.isInteger(puerto)) continue;
    const direccion = local.slice(0, corte).replace(/^\[|\]$/g, '').replace(/%.*$/, '');
    const proceso = /users:\(\("([^"]+)"/.exec(linea)?.[1] ?? null;
    escuchas.push({ direccion, puerto, proceso });
  }
  return escuchas;
}

export function parsearServe(texto: string): RutaServe[] {
  const rutas: RutaServe[] = [];
  let externo: number | null = null;
  let funnel = false;
  for (const linea of texto.split('\n')) {
    const cabecera = /^https?:\/\/[^\s:/]+(?::(\d+))?\s*\(([^)]*)\)/.exec(linea.trim());
    if (cabecera) {
      externo = cabecera[1] ? Number(cabecera[1]) : 443;
      funnel = /funnel on/i.test(cabecera[2]);
      continue;
    }
    const proxy = /proxy\s+https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/.exec(linea);
    if (proxy && externo !== null) {
      const interno = Number(proxy[1]);
      if (!rutas.some((r) => r.externo === externo && r.interno === interno)) {
        rutas.push({ externo, interno, funnel });
      }
    }
  }
  return rutas;
}

const esLoopback = (dir: string) => dir.startsWith('127.') || dir === '::1' || dir === 'localhost';
const esTailnet = (dir: string) => /^100\./.test(dir) || /^fd7a:115c:a1e0:/i.test(dir);

export function clasificar(escuchas: Escucha[], rutas: RutaServe[]): Servicio[] {
  // Los puertos de afuera de `tailscale serve` los abre tailscaled en la IP del
  // tailnet: son la entrada de otro servicio, no un servicio aparte.
  const externos = new Set(rutas.map((r) => r.externo));
  const porPuerto = new Map<number, Servicio>();

  for (const escucha of escuchas) {
    if (IGNORADOS.has(escucha.puerto)) continue;
    if (esTailnet(escucha.direccion) && externos.has(escucha.puerto)) continue;

    const ruta = rutas.filter((r) => r.interno === escucha.puerto);
    let exposicion: Exposicion;
    if (ruta.some((r) => r.funnel)) exposicion = 'publico';
    else if (ruta.length > 0 || esTailnet(escucha.direccion)) exposicion = 'tailnet';
    else if (esLoopback(escucha.direccion)) exposicion = 'local';
    else exposicion = 'publico';

    const previo = porPuerto.get(escucha.puerto);
    const rango: Record<Exposicion, number> = { local: 0, tailnet: 1, publico: 2 };
    // El mismo puerto en v4 y v6: queda una fila, con la exposición más abierta.
    if (previo && rango[previo.exposicion] >= rango[exposicion]) {
      if (!previo.proceso && escucha.proceso) previo.proceso = escucha.proceso;
      continue;
    }
    porPuerto.set(escucha.puerto, {
      puerto: escucha.puerto,
      nombre: NOMBRES[escucha.puerto] ?? escucha.proceso ?? 'sin nombre',
      proceso: escucha.proceso ?? previo?.proceso ?? null,
      exposicion,
      entrada: ruta.length > 0
        ? ruta.map((r) => `:${r.externo}${r.funnel ? ' (Funnel)' : ''}`).join(', ')
        : null,
    });
  }

  return [...porPuerto.values()].sort((a, b) => a.puerto - b.puerto);
}

function correr(comando: string, args: string[]): string {
  return execFileSync(comando, args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
}

export const serviciosService = {
  listar(ejecutar: (comando: string, args: string[]) => string = correr): ServiciosSnapshot {
    let escuchas: Escucha[];
    try {
      escuchas = parsearSs(ejecutar('ss', ['-tlnpH']));
    } catch (error) {
      return { servicios: [], error: `ss: ${error instanceof Error ? error.message : String(error)}` };
    }
    // Sin tailscale (otra máquina, o el daemon caído) igual se listan los puertos: todo queda local o público.
    let rutas: RutaServe[] = [];
    try {
      rutas = parsearServe(ejecutar('tailscale', ['serve', 'status']));
    } catch {
      rutas = [];
    }
    return { servicios: clasificar(escuchas, rutas), error: null };
  },
};
