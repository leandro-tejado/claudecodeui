// Punto 1: un turno headless real con Sonnet muestra el razonamiento mientras se genera.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { abrirSesion, escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { PROYECTO } from '../../lib/config.mjs';

export const meta = {
  descripcion: 'thinking real (Sonnet) por chat.send',
  puerto: 3901, cuota: true,
  checks: ['llegan deltas de pensamiento con texto', 'el razonamiento se ve antes de la respuesta'],
};

export async function correr(ctx) {
  // Los turnos headless de la instancia necesitan el token de la máquina en su entorno, y la
  // suite no maneja credenciales: si no está, el escenario se bloquea y lo decide Leandro.
  const pid = fs.readFileSync(`/tmp/cloudcli-e2e/pid-${meta.puerto}`, 'utf8').trim();
  const conToken = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').some((l) => l.startsWith('CLAUDE_CODE_OAUTH_TOKEN='));
  if (!conToken) return ctx.bloquear('la instancia de prueba no tiene CLAUDE_CODE_OAUTH_TOKEN (decisión de Leandro)');
  // Sesión sin pane: se crea con un -p mínimo en Haiku.
  // Sin las CLAUDE_CODE_* de la sesión que corre la suite: el hijo se cree un subagente sin nadie atendiendo.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !(k.startsWith('CLAUDE_CODE_') && k !== 'CLAUDE_CODE_OAUTH_TOKEN') && k !== 'CLAUDECODE'));
  let salida;
  try {
    salida = execFileSync('claude', ['-p', '--model', 'haiku', '--output-format', 'json', 'Respondé solo: listo'], { cwd: PROYECTO, env, encoding: 'utf8', timeout: 120_000 });
  } catch (e) {
    throw new Error(`claude -p falló (status ${e.status}): ${String(e.stderr || e.stdout).slice(0, 300)}`);
  }
  const sid = JSON.parse(salida).session_id;
  const s = await ctx.abrir();
  await s.pagina.addInitScript(() => localStorage.setItem('claude-model', 'sonnet'));
  await abrirSesion(s, sid);
  const t = await escribirYEnviar(s, '¿Cuántos números primos hay entre 100 y 150? Pensalo paso a paso antes de responder y dame solo el número.');
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
