// Punto 1: un turno headless real con Sonnet muestra el razonamiento mientras se genera.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { abrirSesion, crearSesionFalsa, escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { RAIZ_TMP, puertoDeEscenario } from '../../lib/config.mjs';

export const meta = {
  descripcion: 'thinking real (Sonnet) por chat.send',
  puerto: 3901, cuota: true,
  checks: ['llegan deltas de pensamiento con texto', 'el razonamiento se ve antes de la respuesta'],
};

export async function correr(ctx) {
  // Los turnos headless de la instancia necesitan el token de la máquina en su entorno, y la
  // suite no maneja credenciales: si no está, el escenario se bloquea y lo decide Leandro.
  // Contra :3001 el proceso es el del servicio de usuario `cloudcli`.
  const pid = process.env.CLOUDCLI_URL
    ? execFileSync('systemctl', ['--user', 'show', '-p', 'MainPID', '--value', 'cloudcli'], { encoding: 'utf8' }).trim()
    : fs.readFileSync(path.join(RAIZ_TMP, `pid-${puertoDeEscenario(meta.puerto)}`), 'utf8').trim();
  const conToken = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').some((l) => l.startsWith('CLAUDE_CODE_OAUTH_TOKEN='));
  if (!conToken) return ctx.bloquear('la instancia de prueba no tiene CLAUDE_CODE_OAUTH_TOKEN (decisión de Leandro)');
  // Sesión sin pane: el transcript inicial lo escribe el CLI falso (sin cuota ni credenciales
  // en el shell de la suite); el turno que se mide va por chat.send → SDK con el Claude real
  // de la instancia, que sí tiene el token.
  const sid = crearSesionFalsa('guion:humo nonce:pensamiento', { modelo: 'sonnet' });
  const s = await ctx.abrir();
  await s.pagina.addInitScript(() => localStorage.setItem('claude-model', 'sonnet'));
  await abrirSesion(s, sid);
  const t = await escribirYEnviar(s, '¿Cuántos números primos hay entre 100 y 150? Respondé solo con el número.');
  let tRazon = null; let tResp = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000 && tResp === null) {
    if (tRazon === null && await s.pagina.getByText(/Thinking|Razonamiento|Pensamiento/i).filter({ hasNot: s.pagina.locator('[role=status]') }).first().isVisible().catch(() => false)) tRazon = Date.now() - t;
    if (s.frames.some((f) => f.t >= t && f.datos?.kind === 'complete')) tResp = Date.now() - t;
    await s.pagina.waitForTimeout(150);
  }
  await esperarFin(s, t, 30_000);
  const deltas = s.frames.filter((f) => f.t >= t && (f.datos?.kind === 'thinking_delta' || (f.datos?.kind === 'stream_delta' && f.datos?.thinking)));
  ctx.check('llegan deltas de pensamiento con texto', deltas.length > 0, { datos: { deltas: deltas.length } });
  ctx.check('el razonamiento se ve antes de la respuesta', tRazon !== null && tResp !== null && tRazon < tResp, { evidencia: await ctx.captura(s, 'final'), datos: { tRazon, tResp } });
}
