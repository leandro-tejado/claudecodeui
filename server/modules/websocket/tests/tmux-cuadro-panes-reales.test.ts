import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { enviarPromptVerificado, type EnvioVerificadoDependencias } from '@/modules/websocket/services/tmux-bridge.service.js';
import { leerEstadoPane } from '@/modules/websocket/services/tmux-prompt.service.js';

/*
 * 7-oct: "La sesión no muestra el cuadro de texto de Claude" seguía saliendo
 * después del fix de la raya con nombre. Fixtures de Claude Code 2.1.292
 * (e2e/fixtures/panes/2.1.292/):
 *
 * - `vivo-*`: las sesiones vivas de esa noche, por `orquestar.py leer --json`
 *   (texto plano) y por `capture-pane -p -e` (`-e`, lo que lee CloudCLI). La
 *   conversación se reemplazó por relleno del mismo largo; el cuadro y todo lo
 *   que va debajo están tal cual.
 * - `aislado-*`: un `claude` en un tmux aparte (`-L`), llevado a cada pantalla
 *   a mano: el panel de atajos (`?`), la vista de agentes (`←`), el modo
 *   transcript (`ctrl+o`), un turno con lista de tareas, `claude` cerrado.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', 'e2e', 'fixtures', 'panes', '2.1.292');

function fixture(nombre: string): string {
  return readFileSync(path.join(FIXTURES_DIR, `${nombre}.txt`), 'utf8');
}

const VIVOS = readdirSync(FIXTURES_DIR)
  .filter((archivo) => archivo.startsWith('vivo-'))
  .map((archivo) => archivo.replace(/\.txt$/, ''));

test('las sesiones vivas muestran su cuadro, con y sin escapes', () => {
  assert.ok(VIVOS.length >= 13, `faltan fixtures vivos: ${VIVOS.length}`);
  for (const nombre of VIVOS) {
    const estado = leerEstadoPane(fixture(nombre));
    assert.equal(estado.prompt, null, `${nombre}: no tiene diálogo`);
    assert.notEqual(estado.cuadro, null, `${nombre}: el cuadro está a la vista`);
    assert.equal(estado.vista, 'conversacion', nombre);
  }
});

test('la sugerencia gris en el cuadro (con -e) cuenta como cuadro vacío', () => {
  assert.deepEqual(leerEstadoPane(fixture('vivo-multicuenta-guia-3-e')).cuadro, { texto: '' });
});

test('un claude ocupado, angosto, con lista de tareas o en otro modo de permisos tiene el cuadro vacío', () => {
  for (const nombre of ['aislado-idle', 'aislado-bash-corriendo', 'aislado-angosto', 'aislado-atajos', 'aislado-turno-tareas', 'aislado-modo4']) {
    assert.deepEqual(leerEstadoPane(fixture(nombre)).cuadro, { texto: '' }, nombre);
  }
});

test('el panel de atajos (?) en un pane angosto deja más de 8 líneas debajo del cuadro, y el cuadro se ve igual', () => {
  const estado = leerEstadoPane(fixture('aislado-atajos-60'));
  assert.deepEqual(estado.cuadro, { texto: '' });
  assert.equal(estado.vista, 'conversacion');
});

test('la vista de agentes (←) no es la conversación: su cuadro es para abrir otra sesión', () => {
  const estado = leerEstadoPane(fixture('aislado-agentes'));
  assert.equal(estado.cuadro, null);
  assert.equal(estado.vista, 'agentes');
});

test('una conversación que cita esas pantallas sigue siendo una conversación', () => {
  const citada = fixture('aislado-idle').replace(
    'tmux focus-events off',
    'Your conversation moved to the background — enter to return · space to reply\n  Showing detailed transcript · ctrl+o to toggle\n  tmux focus-events off',
  );
  assert.notEqual(citada, fixture('aislado-idle'));
  const estado = leerEstadoPane(citada);
  assert.equal(estado.vista, 'conversacion');
  assert.deepEqual(estado.cuadro, { texto: '' });
});

test('el modo transcript (ctrl+o) y claude cerrado se reconocen', () => {
  assert.equal(leerEstadoPane(fixture('aislado-transcript')).vista, 'transcript');
  assert.equal(leerEstadoPane(fixture('aislado-cerrada')).vista, 'shell');
  assert.equal(leerEstadoPane('\n\n\n').vista, 'vacia');
});

function paneFijo(pantalla: string): { deps: EnvioVerificadoDependencias; acciones: string[] } {
  const acciones: string[] = [];
  return {
    acciones,
    deps: {
      sendKeysLiteral: async (_pane, payload) => { acciones.push(`texto:${payload}`); },
      sendEnter: async () => { acciones.push('Enter'); },
      capturarPantalla: async () => pantalla,
      esperar: async () => {},
    },
  };
}

test('sin cuadro, el error dice qué muestra el pane y no se teclea nada', async () => {
  const casos: Array<[string, RegExp]> = [
    ['aislado-agentes', /vista de agentes/],
    ['aislado-transcript', /transcript.*ctrl\+o/],
    ['aislado-cerrada', /claude se cerró/i],
  ];
  for (const [nombre, esperado] of casos) {
    const { deps, acciones } = paneFijo(fixture(nombre));
    const resultado = await enviarPromptVerificado('demo', 'hola', deps);
    assert.equal(!resultado.ok && resultado.motivo, 'sin-cuadro', nombre);
    assert.match(!resultado.ok && 'mensaje' in resultado ? resultado.mensaje : '', esperado, nombre);
    assert.deepEqual(acciones, [], nombre);
  }

  const { deps } = paneFijo('algo que no es claude\nPresione una tecla para seguir');
  const resultado = await enviarPromptVerificado('demo', 'hola', deps);
  assert.match(!resultado.ok && 'mensaje' in resultado ? resultado.mensaje : '', /«Presione una tecla para seguir»/);
});

/*
 * 7-oct: un mensaje con una captura adjunta salía siempre con "El texto no
 * apareció en el cuadro". Claude Code cambia la ruta de una imagen pegada
 * (png, jpg, gif, webp) por "[Image #N]" al principio del cuadro, así que el
 * final del mensaje —la ruta— nunca se ve. Capturas de `aislado-adjunto-*`: un
 * `claude` en un tmux aparte con el mismo pegado que manda el chat; Claude
 * recibió cada imagen y la leyó. svg, txt y pdf no se cambian: quedan como
 * "[Pasted text #N]".
 */
const RUTA_ADJUNTO = '/home/leantejado/.cloudcli/assets';
function conAdjuntos(texto: string, archivos: string[]): string {
  return `${texto}\n\nArchivos adjuntos (leelos desde estas rutas):\n${archivos.map((archivo) => `- ${RUTA_ADJUNTO}/${archivo}`).join('\n')}`;
}

/** Un pane que muestra `vacio` hasta que se teclea, `tecleado` hasta el Enter y `enviado` después. */
function paneEnSecuencia(vacio: string, tecleado: string, enviado: string): { deps: EnvioVerificadoDependencias; acciones: string[] } {
  const acciones: string[] = [];
  let pantalla = vacio;
  return {
    acciones,
    deps: {
      sendKeysLiteral: async (_pane, payload) => { acciones.push(`texto:${payload}`); pantalla = tecleado; },
      sendEnter: async () => { acciones.push('Enter'); pantalla = enviado; },
      capturarPantalla: async () => pantalla,
      esperar: async () => {},
    },
  };
}

test('una imagen adjunta se ve como [Image #N] y el mensaje sale con su Enter', async () => {
  const casos: Array<[string, string]> = [
    ['aislado-adjunto-imagen-e', conAdjuntos('que palabra dice la imagen?', ['1791400000001-111111111-image.png'])],
    ['aislado-adjunto-dos-imagenes-e', conAdjuntos('que palabra dice cada imagen?', ['1791400000001-111111111-image.png', '1791400000002-222222222-image.png'])],
    ['aislado-adjunto-sin-texto-e', conAdjuntos('', ['1791400000002-222222222-image.png'])],
  ];
  for (const [nombre, mensaje] of casos) {
    const { deps, acciones } = paneEnSecuencia(fixture('aislado-idle'), fixture(nombre), fixture('aislado-adjunto-tras-enter-e'));
    const resultado = await enviarPromptVerificado('demo', mensaje, deps);
    assert.deepEqual(resultado, { ok: true }, nombre);
    assert.deepEqual(acciones.at(-1), 'Enter', nombre);
    assert.equal(acciones.filter((accion) => accion === 'Enter').length, 1, `${nombre}: un solo Enter, el cuadro se vació`);
  }
});

test('con imagen adjunta, el texto del mensaje igual tiene que estar en el cuadro', async () => {
  // La etiqueta sola no alcanza: si el texto no llegó, no se manda el Enter.
  const tecleado = fixture('aislado-adjunto-imagen-e').replace('que palabra dice la imagen?', 'otra cosa');
  const { deps, acciones } = paneEnSecuencia(fixture('aislado-idle'), tecleado, fixture('aislado-adjunto-tras-enter-e'));
  const resultado = await enviarPromptVerificado('demo', conAdjuntos('que palabra dice la imagen? y que color tiene', ['1-image.png']), deps);
  assert.equal(!resultado.ok && resultado.motivo, 'no-aparecio');
  assert.ok(!acciones.includes('Enter'));
});

test('con la imagen todavía sin cambiar por [Image #N], el cuadro con la ruta también vale', async () => {
  const mensaje = conAdjuntos('mira', ['1-image.png']);
  const tecleado = fixture('aislado-idle').replace(/❯\s.*/, `❯ ${mensaje.split(/\n+/).join('\n  ')}`);
  const { deps } = paneEnSecuencia(fixture('aislado-idle'), tecleado, fixture('aislado-adjunto-tras-enter-e'));
  assert.deepEqual(await enviarPromptVerificado('demo', mensaje, deps), { ok: true });
});
