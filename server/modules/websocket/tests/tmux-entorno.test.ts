import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { sinEntornoDeLaSesionPadre } from '@/modules/websocket/services/tmux-entorno.js';

/*
 * 30-sep: el servidor de tmux lo había arrancado un `claude` del SDK y todos
 * los panes nacían con `CLAUDE_CODE_ENTRYPOINT=sdk-ts`,
 * `CLAUDE_CODE_SESSION_ATTENDED=0` y el id de sesión de otro.
 */

test('el comando corre sin las marcas de la sesión padre, y con el resto del entorno intacto', () => {
  const [comando, ...argumentos] = sinEntornoDeLaSesionPadre(['env']);
  const salida = execFileSync(comando, argumentos, {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'sdk-ts',
      CLAUDE_CODE_SESSION_ATTENDED: '0',
      CLAUDE_CODE_SESSION_ID: 'otra-sesion',
      CLAUDE_CODE_OAUTH_TOKEN: 'token-de-prueba',
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '278000',
    },
  });
  const variables = salida.split('\n').map((linea) => linea.split('=')[0]);

  for (const quitada of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ID']) {
    assert.ok(!variables.includes(quitada), `${quitada} no tiene que llegar al pane`);
  }
  assert.ok(variables.includes('CLAUDE_CODE_OAUTH_TOKEN'), 'el token sigue: sin él claude pide login');
  assert.ok(variables.includes('CLAUDE_CODE_AUTO_COMPACT_WINDOW'));
});
