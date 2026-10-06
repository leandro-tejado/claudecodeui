import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ESPERA_CUADRO_PANE_NUEVO_MS,
  enviarPromptVerificado,
  type EnvioVerificadoDependencias,
} from '@/modules/websocket/services/tmux-bridge.service.js';

/*
 * 5-oct: en `estudio-guia-1` un diálogo propio de Claude Code se comió dos
 * "1" mandados desde el chat, y el chat decía "Enviado" y "Pensando…". El
 * envío ahora mira el pane antes y después de teclear. El pane de acá es de
 * mentira: un cuadro de texto que reacciona a lo que se le manda.
 */

const RAYA = '─'.repeat(80);

function pantallaConCuadro(texto: string, arriba: string[] = ['● Listo.']): string {
  const renglones = texto ? texto.split('\n') : [];
  const cuadro = renglones.length > 0
    ? [`❯ ${renglones[0]}`, ...renglones.slice(1).map((renglon) => `  ${renglon}`)]
    : ['\x1b[39m❯ \x1b[2mTry "create a util logging.py that..."\x1b[0m'];
  return [...arriba, RAYA, ...cuadro, RAYA, '  ctx 12% · 5h 3%', '  ⏵⏵ auto mode on'].join('\n');
}

const DIALOGO = [
  RAYA,
  '  Teach auto mode about your environment?',
  '',
  '  ❯ 1. Yes',
  '    2. Not now',
  '',
  '  Enter to confirm · Esc to cancel',
];

type PaneFalso = {
  deps: EnvioVerificadoDependencias;
  acciones: string[];
  estado: { cuadro: string; dialogo: boolean; sinCuadro: boolean; tragaTexto: boolean; enterPerdidos: number; pegadoLargo: boolean };
};

function paneFalso(inicial: Partial<PaneFalso['estado']> = {}): PaneFalso {
  const estado: PaneFalso['estado'] = {
    cuadro: '', dialogo: false, sinCuadro: false, tragaTexto: false, enterPerdidos: 0, pegadoLargo: false, ...inicial,
  };
  const acciones: string[] = [];
  return {
    acciones,
    estado,
    deps: {
      sendKeysLiteral: async (_pane, payload) => {
        acciones.push(`texto:${payload}`);
        if (estado.tragaTexto || estado.dialogo) return;
        const limpio = payload.replace('\x1b[200~', '').replace('\x1b[201~', '');
        estado.cuadro += estado.pegadoLargo ? '[Pasted text #1 +39 lines]' : limpio;
      },
      sendEnter: async () => {
        acciones.push('Enter');
        if (estado.enterPerdidos > 0) {
          estado.enterPerdidos -= 1;
          return;
        }
        estado.cuadro = '';
      },
      capturarPantalla: async () => {
        if (estado.sinCuadro) return ['   Teach auto mode', '   ←/→ to change · Enter to continue'].join('\n');
        return pantallaConCuadro(estado.cuadro, estado.dialogo ? DIALOGO : undefined);
      },
      esperar: async () => {},
    },
  };
}

test('con el cuadro vacío: teclea, ve el texto en el cuadro, manda Enter y confirma que salió', async () => {
  const { deps, acciones } = paneFalso();
  assert.deepEqual(await enviarPromptVerificado('demo', 'hola, seguí con la fase 2', deps), { ok: true });
  assert.deepEqual(acciones, ['texto:hola, seguí con la fase 2', 'Enter']);
});

test('con un diálogo abierto no se teclea nada', async () => {
  const { deps, acciones } = paneFalso({ dialogo: true });
  assert.deepEqual(await enviarPromptVerificado('demo', '1', deps), { ok: false, motivo: 'dialogo' });
  assert.deepEqual(acciones, []);
});

test('sin el cuadro de texto a la vista, o con algo ya escrito, no se teclea nada y se dice por qué', async () => {
  const sinCuadro = paneFalso({ sinCuadro: true });
  const resultado = await enviarPromptVerificado('demo', 'hola', sinCuadro.deps);
  assert.equal(!resultado.ok && resultado.motivo, 'sin-cuadro');
  assert.deepEqual(sinCuadro.acciones, []);

  const ocupado = paneFalso({ cuadro: 'opción 1, hacé las ediciones' });
  const otro = await enviarPromptVerificado('demo', 'hola', ocupado.deps);
  assert.equal(!otro.ok && otro.motivo, 'cuadro-ocupado');
  assert.match(!otro.ok && 'mensaje' in otro ? otro.mensaje : '', /«opción 1, hacé las ediciones»/);
  assert.deepEqual(ocupado.acciones, []);
});

test('si el texto no aparece en el cuadro, no se manda el Enter', async () => {
  const { deps, acciones } = paneFalso({ tragaTexto: true });
  const resultado = await enviarPromptVerificado('demo', 'hola', deps);
  assert.equal(!resultado.ok && resultado.motivo, 'no-aparecio');
  assert.deepEqual(acciones, ['texto:hola']);
});

test('un Enter que se pierde se repite una vez; si el texto sigue en el cuadro, no se da por enviado', async () => {
  const unaVez = paneFalso({ enterPerdidos: 1 });
  assert.deepEqual(await enviarPromptVerificado('demo', 'hola', unaVez.deps), { ok: true });
  assert.deepEqual(unaVez.acciones, ['texto:hola', 'Enter', 'Enter']);

  const nunca = paneFalso({ enterPerdidos: 99 });
  const resultado = await enviarPromptVerificado('demo', 'hola', nunca.deps);
  assert.equal(!resultado.ok && resultado.motivo, 'no-salio');
  assert.deepEqual(nunca.acciones, ['texto:hola', 'Enter', 'Enter']);
});

test('un pegado largo que el cuadro resume como "[Pasted text #1 …]" cuenta como llegado', async () => {
  const { deps, acciones } = paneFalso({ pegadoLargo: true });
  const texto = Array.from({ length: 40 }, (_, i) => `renglón ${i}`).join('\n');
  assert.deepEqual(await enviarPromptVerificado('demo', texto, deps), { ok: true });
  assert.equal(acciones.at(-1), 'Enter');
});

test('un renglón largo que el cuadro parte en dos se reconoce igual', async () => {
  const { deps, estado } = paneFalso();
  const original = deps.sendKeysLiteral;
  deps.sendKeysLiteral = async (pane, payload) => {
    await original(pane, payload);
    estado.cuadro = `${estado.cuadro.slice(0, 30)}\n${estado.cuadro.slice(30)}`;
  };
  assert.deepEqual(await enviarPromptVerificado('demo', 'un mensaje bastante largo que no entra en un solo renglón del cuadro', deps), { ok: true });
});

/*
 * 6-oct: la orquestadora fija (`--resume` de ~10 MB) tardó más de 4 s en
 * dibujar el cuadro tras recrearse su pane, y el chat contestó `sin-cuadro`
 * sobre un `claude` que todavía estaba cargando.
 */
function paneQueCargaTarde(capturasEnBlanco: number): PaneFalso {
  const pane = paneFalso();
  let capturas = 0;
  const capturar = pane.deps.capturarPantalla;
  pane.deps.capturarPantalla = async (nombre) => (++capturas <= capturasEnBlanco ? '' : capturar(nombre));
  return pane;
}

test('un pane que carga lento da sin-cuadro con la espera normal', async () => {
  const pane = paneQueCargaTarde(40);
  const resultado = await enviarPromptVerificado('p', 'hola', pane.deps);
  assert.equal(!resultado.ok && resultado.motivo, 'sin-cuadro');
  assert.deepEqual(pane.acciones, []);
});

test('un pane recién creado espera más al cuadro y el mensaje llega', async () => {
  const pane = paneQueCargaTarde(40);
  const resultado = await enviarPromptVerificado('p', 'hola', pane.deps, ESPERA_CUADRO_PANE_NUEVO_MS);
  assert.deepEqual(resultado, { ok: true });
});
