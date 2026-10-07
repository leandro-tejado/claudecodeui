import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { marcarTituloTmux, marcarTitulosDeEventos, marcarTitulosDeTmuxVivos } from '@/modules/websocket/services/tmux-titulo.service.js';

/*
 * Nombres humanos también en tmux (pedido del 07-oct): el nombre de la sesión
 * de tmux no cambia —`<proyecto>-<rol>-<n>` o el de `nombreTmux()`, que el
 * bridge valida—, pero el título va en la opción `@titulo` del pane, igual
 * que `@cuenta`, y de ahí lo leen `sesiones.py` y `orquestar.py listar`.
 */

const socket = `cloudcli-prueba-titulo-${process.pid}`;
const argsSocket = ['-L', socket];
const tmux = (...args: string[]) => execFileSync('tmux', [...argsSocket, ...args], { encoding: 'utf8' });

test('marca @titulo en el pane vivo, sin repetir la llamada si no cambió', async () => {
  try {
    tmux('new-session', '-d', '-s', 'proj-chat-1', 'sleep 60');

    assert.equal(await marcarTituloTmux('proj-chat-1', 'Acceso de Antonio al VPS', { argsSocket }), true);
    assert.equal(tmux('show-options', '-t', '=proj-chat-1:', '-qv', '@titulo').trim(), 'Acceso de Antonio al VPS');
    assert.equal(await marcarTituloTmux('proj-chat-1', 'Acceso de Antonio al VPS', { argsSocket }), false, 'mismo título: no llama a tmux');

    assert.equal(await marcarTituloTmux('proj-chat-1', 'Multicuenta: prueba del selector', { argsSocket }), true);
    assert.equal(tmux('show-options', '-t', '=proj-chat-1:', '-qv', '@titulo').trim(), 'Multicuenta: prueba del selector');
  } finally {
    try {
      tmux('kill-server');
    } catch {
      // sin servidor
    }
  }
});

test('no marca un pane que no existe, un nombre inválido ni un título que es el propio nombre', async () => {
  assert.equal(await marcarTituloTmux('no-existe-xyz', 'Algo', { argsSocket }), false);
  assert.equal(await marcarTituloTmux('nombre con espacios', 'Algo', { argsSocket }), false);
  assert.equal(await marcarTituloTmux('proj-chat-2', 'proj-chat-2', { argsSocket }), false);
  assert.equal(await marcarTituloTmux('proj-chat-2', '   ', { argsSocket }), false);
});

test('marcarTitulosDeEventos: solo las sesiones con tmux vivo, y olvida el cache de las muertas', async () => {
  const marcados: Array<[string, string]> = [];
  const olvidados: string[] = [];
  await marcarTitulosDeEventos(
    [
      { session: { summary: 'Acceso de Antonio al VPS', tmux: { nombre: 'proj-chat-1', vivo: true } } },
      { session: { summary: 'Dormida', tmux: { nombre: 'proj-chat-2', vivo: false } } },
      { session: { summary: 'Chat por SDK', tmux: null } },
    ],
    {
      marcar: async (nombre, titulo) => {
        marcados.push([nombre, titulo]);
        return true;
      },
      olvidar: (nombre) => olvidados.push(nombre),
    },
  );
  assert.deepEqual(marcados, [['proj-chat-1', 'Acceso de Antonio al VPS']]);
  assert.deepEqual(olvidados, ['proj-chat-2']);
});

/*
 * Visto en vivo tras el reinicio del 07-oct: `@titulo` solo se marcaba con un
 * `session_upserted`, así que las sesiones quietas (la a854fb85) quedaban sin
 * título hasta su próximo turno. Al arrancar se marcan todas las vivas.
 */
test('al arrancar marca el título de cada sesión con tmux vivo, sin esperar un upsert', async () => {
  const marcados: Array<[string, string]> = [];
  const eventos: Record<string, { session: { summary?: string; tmux?: { nombre: string; vivo: boolean } | null } }> = {
    '4e7d7ee3': { session: { summary: 'Multicuenta: prueba del selector de cuenta', tmux: { nombre: 'cloudcli-workspace-leandro-a854fb85', vivo: true } } },
    'ses-muerta': { session: { summary: 'Otra', tmux: { nombre: 'proj-chat-9', vivo: false } } },
  };

  await marcarTitulosDeTmuxVivos({
    leerVivos: async () => new Map([['4e7d7ee3', true], ['ses-muerta', false], ['sin-fila', true]]),
    construirEvento: async (sid) => eventos[sid] ?? null,
    marcar: async (nombre, titulo) => {
      marcados.push([nombre, titulo]);
      return true;
    },
  });

  assert.deepEqual(marcados, [['cloudcli-workspace-leandro-a854fb85', 'Multicuenta: prueba del selector de cuenta']]);
});
