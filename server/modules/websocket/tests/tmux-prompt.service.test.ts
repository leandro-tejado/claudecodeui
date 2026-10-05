import assert from 'node:assert/strict';
import test from 'node:test';

import {
  _resetPromptsTmuxParaTests,
  detectarPromptTmux,
  esperarQueSeDespeje,
  leerEstadoPane,
  paneTienePrompt,
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

const ASK_USER_QUESTION = [
  '● Te pregunto antes de seguir.',
  '',
  REGLA,
  ' ☐ Color',
  'Which color do you prefer?',
  '❯ 1. Rojo (Recommended)',
  '     Red color option',
  '  2. Azul',
  '     Blue color option',
  '  3. Type something.',
  REGLA,
  '  4. Chat about this',
  'Enter to select · ↑/↓ to navigate · Esc to cancel',
].join('\n');

const ASK_USER_QUESTION_VARIAS = [
  REGLA,
  '←  ☐ Fruta  ☐ Dia  ✔ Submit  →',
  'Before I refactor the module, which of the two approaches do you want me to take',
  'for the storage layer?',
  '❯ 1. Manzana (Recommended)',
  '     Apple option',
  '  2. Pera',
  '     Pear option',
  '  3. Type something.',
  REGLA,
  '  4. Chat about this',
  'Enter to select · Tab/Arrow keys to navigate · Esc to cancel',
].join('\n');

test('AskUserQuestion: la raya antes de "Chat about this" no corta las opciones, y las descripciones van con la suya', () => {
  const prompt = detectarPromptTmux(ASK_USER_QUESTION);
  assert.ok(prompt);
  assert.equal(prompt.pregunta, 'Which color do you prefer?');
  assert.deepEqual(prompt.opciones.map((opcion) => [opcion.numero, opcion.etiqueta]), [
    [1, 'Rojo (Recommended)\nRed color option'],
    [2, 'Azul\nBlue color option'],
    [3, 'Type something.'],
    [4, 'Chat about this'],
  ]);
  assert.equal(prompt.seleccionada, 0);
  assert.equal(prompt.detalle, '☐ Color');
  assert.deepEqual(teclasParaOpcion(prompt, 1), { tipo: 'literal', texto: '2' });
});

test('AskUserQuestion: una pregunta larga en dos renglones llega entera, sin las pestañas', () => {
  const prompt = detectarPromptTmux(ASK_USER_QUESTION_VARIAS);
  assert.equal(
    prompt?.pregunta,
    'Before I refactor the module, which of the two approaches do you want me to take for the storage layer?',
  );
  assert.equal(prompt?.opciones.length, 4);
  assert.equal(prompt?.detalle, '←  ☐ Fruta  ☐ Dia  ✔ Submit  →');
});

test('un mensaje del chat espera a que se conteste la pregunta, y no espera a un pane muerto', async () => {
  const pantallas = [ASK_USER_QUESTION, ASK_USER_QUESTION, EN_REPOSO];
  let lecturas = 0;
  const deps = { capturarPane: async () => pantallas[Math.min(lecturas++, pantallas.length - 1)] };

  assert.equal(await paneTienePrompt('demo', { capturarPane: async () => ASK_USER_QUESTION }), true);
  assert.equal(await paneTienePrompt('demo', { capturarPane: async () => EN_REPOSO }), false);
  assert.equal(await paneTienePrompt('demo', { capturarPane: async () => { throw new Error('no existe'); } }), false);

  assert.equal(await esperarQueSeDespeje('demo', { sigueVivo: () => true, intervaloMs: 1 }, deps), true);
  assert.equal(lecturas, 3, 'sigue mirando mientras la pregunta está abierta');

  let vivo = true;
  const muerto = esperarQueSeDespeje('demo', { sigueVivo: () => vivo, intervaloMs: 1 }, {
    capturarPane: async () => { vivo = false; return ASK_USER_QUESTION; },
  });
  assert.equal(await muerto, false);
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

const ASK_USER_QUESTION_SUBMIT = [
  REGLA,
  '←  ☒ Fruta  ☒ Dia  ✔ Submit  →',
  '',
  'Review your answers',
  '',
  ' ● Which fruit?',
  '   → Pera',
  ' ● Which day?',
  '   → Miercoles',
  '',
  'Ready to submit your answers?',
  '',
  '❯ 1. Submit answers',
  '  2. Cancel',
  '',
  '',
].join('\n');

test('AskUserQuestion: la pantalla de confirmar, que no tiene pie, también espera respuesta', () => {
  const prompt = detectarPromptTmux(ASK_USER_QUESTION_SUBMIT);
  assert.equal(prompt?.pregunta, 'Ready to submit your answers?');
  assert.deepEqual(prompt?.opciones.map((opcion) => opcion.etiqueta), ['Submit answers', 'Cancel']);
  assert.match(prompt?.detalle ?? '', /Which day\?\n→ Miercoles/);
  // Sin pie y sin pestañas no es un diálogo: es una lista cualquiera que quedó al final.
  assert.equal(detectarPromptTmux(ASK_USER_QUESTION_SUBMIT.replace('←  ☒ Fruta  ☒ Dia  ✔ Submit  →', 'Resumen')), null);
});

test('AskUserQuestion: "Type something." se contesta con el dígito, el texto en un renglón y Enter', async () => {
  const prompt = detectarPromptTmux(ASK_USER_QUESTION)!;
  assert.equal(prompt.opciones[2].libre, true);
  assert.equal(prompt.opciones[0].libre, undefined);
  assert.deepEqual(teclasParaOpcion(prompt, 2, 'Verde,\nmás bien oscuro'), { tipo: 'libre', numero: '3', texto: 'Verde, más bien oscuro' });

  _resetPromptsTmuxParaTests();
  const { deps, enviadas, pantallas } = fake();
  pantallas.set('demo-guia-1', ASK_USER_QUESTION);
  await revisarPromptsTmux(deps);
  const [pendiente] = promptsTmuxPendientes();

  const vacia = await responderPromptTmux({ sessionId: 'app-1', pane: 'demo-guia-1', promptId: pendiente.id, opcion: 2, texto: '  ' }, {}, deps);
  assert.equal(!vacia.ok && vacia.codigo, 'TMUX_PROMPT_BAD_OPTION');
  assert.deepEqual(enviadas, []);

  const ok = await responderPromptTmux({ sessionId: 'app-1', pane: 'demo-guia-1', promptId: pendiente.id, opcion: 2, texto: 'Verde' }, {}, deps);
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(enviadas, [{ pane: 'demo-guia-1', teclas: { tipo: 'libre', numero: '3', texto: 'Verde' } }]);
  _resetPromptsTmuxParaTests();
});

/*
 * 5-oct: en `estudio-guia-1` Claude Code abrió su propio diálogo, "Teach auto
 * mode about your environment?", y dos "1" mandados desde el chat se los
 * comió. Primero aparece arriba del cuadro de texto, que sigue abajo; su
 * "Yes" abre un formulario a pantalla entera, con renglones que tienen valor
 * y se cambian con ←/→. Forma medida ese día (Claude Code v2.1.3xx).
 */
const RAYA_FORMULARIO = '▔'.repeat(100);

const AVISO_AUTO_MODE = [
  '  Para seguir, elegí una:',
  REGLA,
  '  Teach auto mode about your environment?',
  '',
  '  Auto mode works better when it knows your environment. Takes about a minute.',
  '',
  '  ❯ 1. Yes',
  '    2. Not now',
  "    3. Don't show again",
  '',
  '  Enter to confirm · Esc to cancel',
  REGLA,
  '❯ algo que quedó escrito',
  REGLA,
  '  ctx 13% · 5h 3% (09:20) · 7d 0%',
  '  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents',
].join('\n');

const FORMULARIO_AUTO_MODE = [
  '  ¿Cuál querés?',
  '',
  '✻ Baked for 2m 32s · done 4:50 AM',
  RAYA_FORMULARIO,
  '   Teach auto mode about your environment?',
  '',
  '   Claude Code reads this project, your recent Claude sessions, and',
  '   optionally your shell history and other repositories.',
  '',
  '     How you use Claude here     Mixed',
  '   ❯ Also scan shell history     false',
  '     Also scan your other repos  false',
  '',
  '     Continue',
  '',
  '   ←/→ to change · Enter to continue · Esc to cancel',
].join('\n');

test('5-oct: el aviso de auto mode, arriba del cuadro de texto, es una pregunta con sus tres opciones y Esc', () => {
  const prompt = detectarPromptTmux(AVISO_AUTO_MODE);
  assert.ok(prompt);
  assert.equal(prompt.pregunta, 'Teach auto mode about your environment?');
  assert.match(prompt.detalle, /Auto mode works better when it knows your environment/);
  assert.deepEqual(prompt.opciones.map((opcion) => opcion.etiqueta), ['Yes', 'Not now', "Don't show again"]);
  assert.deepEqual(prompt.teclas, [{ tecla: 'Escape', accion: 'cancel' }]);
  assert.equal(teclasParaOpcion(prompt, 0).tipo, 'literal');
});

test('5-oct: el formulario de auto mode no es una lista: sale con todo lo que muestra y las teclas de su pie', () => {
  const prompt = detectarPromptTmux(FORMULARIO_AUTO_MODE);
  assert.ok(prompt);
  assert.equal(prompt.pregunta, 'Teach auto mode about your environment?');
  assert.deepEqual(prompt.opciones, []);
  assert.equal(prompt.seleccionada, -1);
  assert.match(prompt.detalle, /❯ Also scan shell history {5}false/);
  assert.match(prompt.detalle, /Continue$/);
  assert.deepEqual(prompt.teclas.map((tecla) => tecla.tecla), ['Up', 'Down', 'Left', 'Right', 'Enter', 'Escape']);
  assert.equal(prompt.teclas.find((tecla) => tecla.tecla === 'Enter')?.accion, 'continue');
  // Mover el cursor cambia lo que se ve, y con eso la huella.
  const abajo = detectarPromptTmux(FORMULARIO_AUTO_MODE
    .replace('   ❯ Also scan shell history', '     Also scan shell history')
    .replace('     Also scan your other repos', '   ❯ Also scan your other repos'));
  assert.notEqual(abajo?.id, prompt.id);
});

test('un pie suelto en la conversación, o un pie sin raya que abra el diálogo, no es un diálogo', () => {
  const enLaRespuesta = [
    '● Para cerrarlo apretá Esc. El pie dice:',
    '  Enter to confirm · Esc to cancel',
    REGLA,
    '❯ ',
    REGLA,
    '  ctx 12%',
  ].join('\n');
  // Sin opciones y sin la raya de arriba: no se toma como diálogo.
  assert.equal(detectarPromptTmux(enLaRespuesta), null);
  // Una frase que menciona la tecla no es un pie.
  assert.equal(detectarPromptTmux([REGLA, ' Algo', '', ' Si querés, Esc to cancel y listo, o seguí escribiendo.'].join('\n')), null);
  assert.equal(detectarPromptTmux(CORRIENDO), null);
});

test('el cuadro de texto: vacío, con el ejemplo atenuado, con algo escrito, o tapado por un formulario', () => {
  assert.deepEqual(leerEstadoPane(EN_REPOSO), { prompt: null, cuadro: { texto: '' } });
  const conEjemplo = EN_REPOSO.replace('❯ ', '\x1b[39m❯\u00a0\x1b[2mTry "create a util logging.py that..."\x1b[0m');
  assert.deepEqual(leerEstadoPane(conEjemplo).cuadro, { texto: '' });
  const escrito = EN_REPOSO.replace('❯ ', '\x1b[39m❯\u00a0hola mundo\n  segundo renglón');
  assert.deepEqual(leerEstadoPane(escrito).cuadro, { texto: 'hola mundo\nsegundo renglón' });
  assert.equal(leerEstadoPane(AVISO_AUTO_MODE).cuadro?.texto, 'algo que quedó escrito');
  assert.ok(leerEstadoPane(AVISO_AUTO_MODE).prompt);
  assert.deepEqual(leerEstadoPane(FORMULARIO_AUTO_MODE).cuadro, null);
  assert.equal(detectarPromptTmux(conEjemplo), null);
});

test('una tecla del pie se manda sola, y solo si el diálogo de ahora la ofrece', async () => {
  _resetPromptsTmuxParaTests();
  const { deps, enviadas, pantallas } = fake();
  pantallas.set('demo-guia-1', FORMULARIO_AUTO_MODE);
  await revisarPromptsTmux(deps);
  const [pendiente] = promptsTmuxPendientes();
  assert.equal(pendiente.pregunta, 'Teach auto mode about your environment?');

  const abajo = await responderPromptTmux({ sessionId: 'app-1', pane: 'demo-guia-1', promptId: pendiente.id, tecla: 'Down' }, {}, deps);
  assert.deepEqual(abajo, { ok: true });
  const tab = await responderPromptTmux({ sessionId: 'app-1', pane: 'demo-guia-1', promptId: pendiente.id, tecla: 'Tab' }, {}, deps);
  assert.equal(!tab.ok && tab.codigo, 'TMUX_PROMPT_BAD_OPTION');
  const inventada = await responderPromptTmux({ sessionId: 'app-1', pane: 'demo-guia-1', promptId: pendiente.id, tecla: 'C-c' }, {}, deps);
  assert.equal(!inventada.ok && inventada.codigo, 'TMUX_PROMPT_BAD_OPTION');
  assert.deepEqual(enviadas, [{ pane: 'demo-guia-1', teclas: { tipo: 'teclas', teclas: ['Down'] } }]);
  _resetPromptsTmuxParaTests();
});

// 5-oct: un AskUserQuestion de varias respuestas, medido en un pane
// descartable. El dígito marca o desmarca y el cursor no se mueve; "Submit"
// no tiene número y se llega con las flechas.
const VARIAS_RESPUESTAS = [
  REGLA,
  '←  ☐ Frutas  ✔ Submit  →',
  '',
  '│ ¿Qué frutas llevamos al picnic? Elegí todas las que quieras, la lista es',
  '│ larga a propósito.',
  '',
  '❯ 1. [ ] Manzana',
  '         Fruta roja o verde',
  '  2. [✔] Pera',
  '         Fruta dulce y jugosa',
  '  3. [ ] Type something',
  '     Submit',
  REGLA,
  '  4. Chat about this',
  'Enter to select · ↑/↓ to navigate · Esc to cancel',
].join('\n');

test('5-oct: varias respuestas: casillas, "Submit" como opción propia y la pregunta encuadrada entera', () => {
  const prompt = detectarPromptTmux(VARIAS_RESPUESTAS);
  assert.ok(prompt);
  assert.equal(prompt.pregunta, '¿Qué frutas llevamos al picnic? Elegí todas las que quieras, la lista es larga a propósito.');
  assert.deepEqual(
    prompt.opciones.map((opcion) => [opcion.numero, opcion.etiqueta.split('\n')[0], Boolean(opcion.casilla), Boolean(opcion.libre)]),
    [
      [1, '[ ] Manzana', true, false],
      [2, '[✔] Pera', true, false],
      [3, '[ ] Type something', true, true],
      [null, 'Submit', false, false],
      [4, 'Chat about this', false, false],
    ],
  );
  assert.deepEqual(teclasParaOpcion(prompt, 1), { tipo: 'literal', texto: '2' });
  assert.deepEqual(teclasParaOpcion(prompt, 3), { tipo: 'teclas', teclas: ['Down', 'Down', 'Down', 'Enter'] });
  assert.deepEqual(teclasParaOpcion(prompt, 2, 'Kiwi'), { tipo: 'escribir', teclas: ['Down', 'Down'], texto: 'Kiwi' });

  // Con el cursor parado en "Submit".
  const enSubmit = detectarPromptTmux(VARIAS_RESPUESTAS
    .replace('❯ 1. [ ] Manzana', '  1. [ ] Manzana')
    .replace('     Submit', '❯    Submit'));
  assert.equal(enSubmit?.seleccionada, 3);
  assert.deepEqual(enSubmit && teclasParaOpcion(enSubmit, 3), { tipo: 'teclas', teclas: ['Enter'] });
});
