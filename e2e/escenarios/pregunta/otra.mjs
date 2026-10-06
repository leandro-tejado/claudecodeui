// Fase 9, paso 2/4: "Otra" con texto libre tiene que llegar a Claude literal,
// sin que las comillas, comas ni símbolos se rompan en el camino (tool_use →
// WS → `updatedInput.answers` → el eco del CLI falso).
//
// Solo headless: el equivalente en tmux (texto libre en una pregunta de
// casillas) ya tiene su propia cobertura — unitaria, no E2E, porque el
// gobernador está en rojo y los escenarios `pregunta/tmux-*` quedan
// bloqueados — en
// `server/modules/websocket/tests/tmux-prompt.service.test.ts`
// (`responderSeleccionCompuestaTmux` rechaza una opción libre sin texto, y
// `teclasParaSeleccionCompuesta` compone C-u + el texto tal cual para la
// opción tildada en modo libre).
import { crearSesionFalsa, abrirSesion, escribirYEnviar, esperarFin } from '../../lib/chat.mjs';

export const meta = {
  descripcion: '"Otra" con texto libre llega literal a Claude (headless)',
  puerto: 3902,
  checks: ['el texto libre de "Otra" llega literal, sin romperse'],
};

// Comillas, comas y un signo de pregunta: lo mismo que rompería un regex
// `[^"]+` o un split naíf por ", ".
const TEXTO_LIBRE = 'Un "verde azulado", medio raro ¿no?';

export async function correr(ctx) {
  const id = crearSesionFalsa('guion:humo nonce:otra');
  const s = await ctx.abrir();
  await abrirSesion(s, id);
  const t = await escribirYEnviar(s, 'guion:pregunta');
  const btn = (texto) => s.pagina.getByRole('button', { name: new RegExp(`^\\s*\\d*\\s*${texto}`) }).last();

  const vio = await btn('Azul').waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  ctx.check('la pregunta llega a la UI', vio, { evidencia: await ctx.captura(s, 'pregunta') });
  if (!vio) return;

  // Pregunta 1 (color, single): "Otra" con texto libre en vez de una opción fija.
  await btn('Other\\.\\.\\.').click();
  const campo = s.pagina.getByPlaceholder(/./).last();
  await campo.fill(TEXTO_LIBRE);
  await ctx.captura(s, 'otra-escrita');
  await s.pagina.getByRole('button', { name: /Next/ }).click();

  // Pregunta 2 (frutas, multi): una opción fija cualquiera, sin texto libre.
  await btn('Manzana').click();
  await s.pagina.getByRole('button', { name: /Next/ }).click();

  // Pregunta 3 (comillas): otra opción fija.
  await btn('Sí').click();
  await s.pagina.getByRole('button', { name: /Submit/ }).click();

  await esperarFin(s, t, 20_000);
  await s.pagina.waitForTimeout(2000);
  const eco = await s.pagina.locator('.chat-messages-pane').innerText();
  const linea = (eco.match(/Elegiste: [^\n]*/g) || []).pop() ?? '';
  ctx.check('el texto libre de "Otra" llega literal, sin romperse', linea.includes(TEXTO_LIBRE), {
    datos: { linea, esperado: TEXTO_LIBRE },
    evidencia: await ctx.captura(s, 'respondida'),
  });
}
