import assert from 'node:assert/strict';
import test from 'node:test';

import { tituloHumano } from '@/modules/providers/services/titulo-humano.js';

/*
 * Nombres de sesión para una persona (pedido del 07-oct): cortos, que digan
 * qué se va a trabajar. Regla determinista sobre el primer mensaje — sin
 * gastar cuota en un modelo. Los casos salen de títulos reales de
 * ~/.cloudcli/auth.db que hoy se ven como el prompt crudo.
 */

const PLANES: Record<string, string> = {
  '/home/leandro/ws/plans/06-octubre-vps-multi-cuenta.md': '# VPS con varias cuentas de IA a la vez\n\n**Fecha:** 6 de Octubre 2026\n',
  '/home/leandro/ws/clientes/fm/plans/04-octubre-estudio-vps-notion.md': '---\nx: 1\n---\n\n# Estudio de edición en el VPS, con Notion\n',
};
const leerArchivo = (ruta: string): string | null => PLANES[ruta] ?? null;
const titulo = (texto: string) => tituloHumano(texto, { cwd: '/home/leandro/ws', leerArchivo });

test('un comando de plan toma el título del plan y queda definitivo', () => {
  assert.deepEqual(
    titulo('/aos-core:ejecutar-plan plans/06-octubre-vps-multi-cuenta.md — Leandro ya aprobó la Fase 1, seguí con la 2'),
    { titulo: 'VPS con varias cuentas de IA a la vez', definitivo: true },
  );
  assert.deepEqual(
    titulo('/aos-core:ejecutar-plan /home/leandro/ws/clientes/fm/plans/04-octubre-estudio-vps-notion.md'),
    { titulo: 'Estudio de edición en el VPS, con Notion', definitivo: true },
  );
});

test('un plan que no se puede leer se nombra por su archivo, sin la fecha', () => {
  assert.deepEqual(titulo('/aos-core:ejecutar-plan plans/29-septiembre-descuadre-stock-reservas.md'), {
    titulo: 'Plan: descuadre stock reservas',
    definitivo: true,
  });
});

test('el formato de transcript de un slash command (<command-name>) también', () => {
  assert.equal(
    titulo('<command-message>aos-core:ejecutar-plan</command-message>\n<command-name>/aos-core:ejecutar-plan</command-name>\n<command-args>plans/06-octubre-vps-multi-cuenta.md</command-args>')?.titulo,
    'VPS con varias cuentas de IA a la vez',
  );
});

test('saca el comando /skill, las rutas, el código y el relleno, y corta en la primera frase', () => {
  const casos: Array<[string, string]> = [
    ['Usá la herramienta Bash para correr exactamente: python3 -c "print(6*7)" ; después Bash', 'Usá la herramienta Bash para correr exactamente'],
    ['Prueba de permisos, hacé exactamente esto y nada más, sin explicar: 1) Bash: `wc -c ~/.claude/token.env`.', 'Prueba de permisos'],
    ['hola! agregá a Antonio al VPS con acceso por SSH. Tiene que poder entrar desde su notebook.', 'Agregá a Antonio al VPS con acceso por SSH'],
    ['Leandro ya aprobó. Arreglá el cuadro de texto de tmux en ~/cloudcli/src/modules/chat/ChatComposer.tsx', 'Arreglá el cuadro de texto de tmux'],
    ['/os-organizar CORRIDA_WRAPPER=os-organizar.sh', 'Os organizar'],
    ['cuanto es el periodo a esperar cuando se hace cada cambio de meta?', 'Cuanto es el periodo a esperar cuando se hace…'],
    ['! for i in $(seq 1 40); do echo linea $i; done', 'Comando: for i in $(seq 1 40)'],
  ];
  for (const [entrada, esperado] of casos) {
    const resultado = titulo(entrada);
    assert.equal(resultado?.titulo, esperado, entrada);
    assert.equal(resultado?.definitivo, false, entrada);
  }
});

test('nunca pasa de 50 caracteres', () => {
  const largo = titulo('Necesito que revises toda la configuración del servidor de producción y me digas qué cambiarías primero');
  assert.ok(largo && largo.titulo.length <= 50, largo?.titulo);
});

test('sin nada que se pueda leer como título, null', () => {
  assert.equal(titulo(''), null);
  assert.equal(titulo('   '), null);
  assert.equal(titulo('`ls -la`'), null);
});

// Visto en la base el 07-oct (f21c5678): el modo bash del CLI queda en el
// transcript como `<bash-input>…</bash-input>`, no con el `!` delante.
test('el formato de transcript del modo bash (<bash-input>) también', () => {
  assert.deepEqual(titulo('<bash-input>for i in $(seq 1 40); do echo $i; done</bash-input>'), {
    titulo: 'Comando: for i in $(seq 1 40)',
    definitivo: false,
  });
});
