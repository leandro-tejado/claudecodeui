import assert from 'node:assert/strict';
import test from 'node:test';

import {
  _resetPromptsTmuxParaTests,
  detectarPromptTmux,
  promptsTmuxPendientes,
  responderPromptTmux,
  revisarPromptsTmux,
  teclasParaOpcion,
  type TeclasTmux,
  type VigiaPromptsDependencias,
} from '@/modules/websocket/services/tmux-prompt.service.js';

/*
 * 30-sep: `optimumads-guia-1` estuvo casi 10 h frenada en el "Do you want to
 * proceed?" de la regla `ask` de `Bash(git push *)` y CloudCLI no mostraba
 * nada. Las capturas de abajo reproducen la forma de lo que dibuja Claude
 * Code v2.1.285 en un pane de tmux (medida ese día), con contenido neutro.
 */

const REGLA = '─'.repeat(100);

const PERMISO_AUTO_MODE = [
  '● Commit y push del plan',
  '',
  REGLA,
  ' Bash command',
  '',
  '   │ git add plans/demo.md && git commit -q -m "plan demo" &&',
  '   │ git push -q && git log --oneline -1',
  '   Commit and push the plan',
  '',
  ' Contains simple_expansion',
  ' Ask rule Bash(git push *) overrides auto mode for this command.',
  ' /permissions to let auto mode decide',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. No',
  '',
  ' Esc to cancel · Tab to amend',
  '',
  '',
  '',
].join('\n');

const PERMISO_TRES_OPCIONES = [
  REGLA,
  ' Bash command',
  '',
  '   gh run list -L 1',
  '   List the last run',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and don’t ask again for: gh run *',
  '   3. No',
  '',
  ' Esc to cancel · Tab to amend',
].join('\n');

const CONFIANZA = [
  REGLA,
  ' Accessing workspace:',
  '',
  ' /tmp/demo',
  '',
  ' Quick safety check: Is this a project you created or one you trust? (Like your',
  ' own code, a well-known open source project, or work from your team).',
  '',
  ' Security guide',
  '',
  ' ❯ No, exit',
  '   Yes, I trust this folder',
  '',
  ' Enter to confirm · Esc to cancel',
].join('\n');

const EN_REPOSO = [
  '● Listo.',
  '',
  REGLA,
  '❯ ',
  REGLA,
  '  ctx 12% · 5h 38% (18:40) · 7d 57%',
  '  ⏸ manual mode on · ← for agents',
].join('\n');

const CORRIENDO = [
  '· Zigzagging… (45m 57s · ↓ 420 tokens)',
  REGLA,
  '❯ ',
  REGLA,
  '  esc to interrupt',
].join('\n');

test('detecta el "Do you want to proceed?" con sus dos opciones y el comando que lo frenó', () => {
  const prompt = detectarPromptTmux(PERMISO_AUTO_MODE);
  assert.ok(prompt);
  assert.equal(prompt.pregunta, 'Do you want to proceed?');
  assert.deepEqual(prompt.opciones, [
    { indice: 0, numero: 1, etiqueta: 'Yes' },
    { indice: 1, numero: 2, etiqueta: 'No' },
  ]);
  assert.equal(prompt.seleccionada, 0);
  // El borde `│` de los comandos largos no llega a la pantalla del chat.
  assert.match(prompt.detalle, /^Bash command\n\ngit add plans\/demo\.md/);
  assert.match(prompt.detalle, /Ask rule Bash\(git push \*\) overrides auto mode/);
  assert.doesNotMatch(prompt.detalle, /│|Do you want to proceed/);
});

test('un prompt de tres opciones las trae las tres, en orden', () => {
  const prompt = detectarPromptTmux(PERMISO_TRES_OPCIONES);
  assert.deepEqual(prompt?.opciones.map((opcion) => [opcion.numero, opcion.etiqueta]), [
    [1, 'Yes'],
    [2, 'Yes, and don’t ask again for: gh run *'],
    [3, 'No'],
  ]);
});

test('el diálogo de confianza, sin números, también es una pregunta pendiente', () => {
  const prompt = detectarPromptTmux(CONFIANZA);
  assert.ok(prompt);
  assert.equal(prompt.pregunta, 'Quick safety check: Is this a project you created or one you trust?');
  assert.deepEqual(prompt.opciones.map((opcion) => [opcion.numero, opcion.etiqueta]), [
    [null, 'No, exit'],
    [null, 'Yes, I trust this folder'],
  ]);
  assert.match(prompt.detalle, /\/tmp\/demo/);
});

test('una opción que no entra en un renglón sigue siendo una sola opción', () => {
  const prompt = detectarPromptTmux([
    REGLA,
    ' Read file',
    '',
    ' Allow this read outside the working directories?',
    ' ❯ 1. Yes',
    '   2. Yes, allow reading from /home/demo/un/directorio/con/un/nombre/muy/largo/que/no/entra/',
    '      en/un/solo/renglon during this session',
    '   3. No',
    '',
    ' Esc to cancel · Tab to amend',
  ].join('\n'));
  assert.equal(prompt?.pregunta, 'Allow this read outside the working directories?');
  assert.equal(prompt?.opciones.length, 3);
  assert.match(prompt?.opciones[1].etiqueta ?? '', /no\/entra\/\nen\/un\/solo\/renglon during this session$/);
});

test('un pane en reposo, uno trabajando o uno con el diálogo ya tapado no esperan respuesta', () => {
  assert.equal(detectarPromptTmux(EN_REPOSO), null);
  assert.equal(detectarPromptTmux(CORRIENDO), null);
  assert.equal(detectarPromptTmux(`${PERMISO_AUTO_MODE}\n● Siguió trabajando\n${EN_REPOSO}`), null);
  assert.equal(detectarPromptTmux(''), null);
});

test('la huella cambia si cambia el comando, aunque la pregunta sea la misma', () => {
  const a = detectarPromptTmux(PERMISO_AUTO_MODE);
  const b = detectarPromptTmux(PERMISO_AUTO_MODE.replace('plans/demo.md', 'plans/otro.md'));
  assert.ok(a && b);
  assert.notEqual(a.id, b.id);
  assert.equal(a.id, detectarPromptTmux(PERMISO_AUTO_MODE)?.id);
});

test('elegir en un prompt numerado es teclear el número; en uno sin numerar, flechas y Enter', () => {
  const numerado = detectarPromptTmux(PERMISO_TRES_OPCIONES)!;
  assert.deepEqual(teclasParaOpcion(numerado, 2), { tipo: 'literal', texto: '3' });

  const confianza = detectarPromptTmux(CONFIANZA)!;
  assert.deepEqual(teclasParaOpcion(confianza, 1), { tipo: 'teclas', teclas: ['Down', 'Enter'] });
  assert.deepEqual(teclasParaOpcion(confianza, 0), { tipo: 'teclas', teclas: ['Enter'] });
  assert.deepEqual(
    teclasParaOpcion({ ...confianza, seleccionada: 1 }, 0),
    { tipo: 'teclas', teclas: ['Up', 'Enter'] },
  );
});

type Fake = {
  deps: VigiaPromptsDependencias;
  pantallas: Map<string, string>;
  enviadas: Array<{ pane: string; teclas: TeclasTmux }>;
  emitidas: Array<Record<string, unknown>>;
  orden: string[];
};

function fake(): Fake {
  const pantallas = new Map<string, string>([
    ['demo-guia-1', PERMISO_AUTO_MODE],
    ['demo-guia-2', EN_REPOSO],
    ['web', PERMISO_AUTO_MODE],
    ['sin-registro', PERMISO_AUTO_MODE],
  ]);
  const enviadas: Fake['enviadas'] = [];
  const emitidas: Fake['emitidas'] = [];
  const orden: string[] = [];
  return {
    pantallas,
    enviadas,
    emitidas,
    orden,
    deps: {
      listarPanes: async () => [...pantallas.keys()],
      capturarPane: async (pane) => {
        const pantalla = pantallas.get(pane);
        if (pantalla === undefined) throw new Error(`no existe ${pane}`);
        return pantalla;
      },
      leerRegistro: () => ({
        'demo-guia-1': { nombre: 'demo-guia-1', session_id: 'claude-1' },
        'demo-guia-2': { nombre: 'demo-guia-2', session_id: 'claude-2' },
        web: { nombre: 'web', session_id: 'claude-web' },
      }),
      sesionDeLaApp: (id) => ({ 'claude-1': 'app-1', 'claude-2': 'app-2', 'claude-web': 'app-web' })[id] ?? null,
      enviarTeclas: async (pane, teclas) => {
        orden.push('teclas');
        enviadas.push({ pane, teclas });
      },
      emitir: (payload) => { emitidas.push(payload); },
      hayClientes: () => true,
    },
  };
}

test('el vigía anota la sesión que espera y avisa una sola vez, sin tocar `web` ni panes que no conoce', async () => {
  _resetPromptsTmuxParaTests();
  const { deps, emitidas, pantallas } = fake();

  await revisarPromptsTmux(deps);
  assert.equal(emitidas.length, 1);
  assert.equal(emitidas[0].kind, 'tmux_prompts');
  const pendientes = emitidas[0].prompts as Array<{ sessionId: string; pane: string; pregunta: string }>;
  assert.deepEqual(pendientes.map((p) => [p.sessionId, p.pane, p.pregunta]), [
    ['app-1', 'demo-guia-1', 'Do you want to proceed?'],
  ]);

  await revisarPromptsTmux(deps);
  assert.equal(emitidas.length, 1, 'lo mismo de antes no se vuelve a anunciar');

  pantallas.set('demo-guia-1', EN_REPOSO);
  await revisarPromptsTmux(deps);
  assert.equal(emitidas.length, 2);
  assert.deepEqual(emitidas[1].prompts, []);
});

test('contestar teclea la opción en el pane, después de puentearlo', async () => {
  _resetPromptsTmuxParaTests();
  const { deps, enviadas, orden } = fake();
  await revisarPromptsTmux(deps);
  const [pendiente] = promptsTmuxPendientes();

  const resultado = await responderPromptTmux(
    { sessionId: 'app-1', pane: 'demo-guia-1', promptId: pendiente.id, opcion: 0 },
    { antesDeEnviar: async () => { orden.push('puente'); } },
    deps,
  );

  assert.deepEqual(resultado, { ok: true });
  assert.deepEqual(enviadas, [{ pane: 'demo-guia-1', teclas: { tipo: 'literal', texto: '1' } }]);
  assert.deepEqual(orden, ['puente', 'teclas']);
});

test('si el pane ya muestra otra cosa, no se teclea nada', async () => {
  _resetPromptsTmuxParaTests();
  const { deps, enviadas, pantallas } = fake();
  await revisarPromptsTmux(deps);
  const [pendiente] = promptsTmuxPendientes();

  // Lo contestaron desde la terminal y vino otra pregunta.
  pantallas.set('demo-guia-1', PERMISO_TRES_OPCIONES);
  const resultado = await responderPromptTmux(
    { sessionId: 'app-1', pane: 'demo-guia-1', promptId: pendiente.id, opcion: 1 },
    {},
    deps,
  );

  assert.equal(resultado.ok, false);
  assert.equal(!resultado.ok && resultado.codigo, 'TMUX_PROMPT_STALE');
  assert.deepEqual(enviadas, []);
});

test('no se le teclea a un pane que no está esperando por esa sesión', async () => {
  _resetPromptsTmuxParaTests();
  const { deps, enviadas } = fake();
  await revisarPromptsTmux(deps);
  const [pendiente] = promptsTmuxPendientes();

  for (const intento of [
    { sessionId: 'app-2', pane: 'demo-guia-1' },
    { sessionId: 'app-web', pane: 'web' },
    { sessionId: 'app-1', pane: 'demo-guia-2' },
  ]) {
    const resultado = await responderPromptTmux({ ...intento, promptId: pendiente.id, opcion: 0 }, {}, deps);
    assert.equal(!resultado.ok && resultado.codigo, 'TMUX_PROMPT_UNKNOWN');
  }
  const fueraDeRango = await responderPromptTmux(
    { sessionId: 'app-1', pane: 'demo-guia-1', promptId: pendiente.id, opcion: 5 },
    {},
    deps,
  );
  assert.equal(!fueraDeRango.ok && fueraDeRango.codigo, 'TMUX_PROMPT_BAD_OPTION');
  assert.deepEqual(enviadas, []);
  _resetPromptsTmuxParaTests();
});
