// Plan 09-oct, Fase 2: Archivos es un panel a la derecha, no una pestaña. Se
// abre con el ícono de la cabecera y con Ctrl+B, y el chat sigue a la vista.
import { abrirSesion, crearSesionFalsa, SEL } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'el panel de Archivos abre y cierra a la derecha sin tapar el chat',
  puerto: 3902,
  checks: [
    'el ícono abre el panel a la derecha y el chat sigue visible',
    'Ctrl+B lo cierra y lo vuelve a abrir',
  ],
};

const panel = (s) => s.pagina.locator('[role="separator"][aria-label="Ajustar el ancho del panel de archivos"]');

export async function correr(ctx) {
  const id = crearSesionFalsa('guion:humo nonce:panel');
  const s = await ctx.abrir();
  await abrirSesion(s, id);
  const boton = s.pagina.getByRole('button', { name: 'Archivos del proyecto' });
  // Arranca cerrado, sea cual sea la preferencia guardada.
  if (await panel(s).count()) await boton.click();
  await boton.click();
  await panel(s).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const caja = await panel(s).boundingBox().catch(() => null);
  const ancho = s.pagina.viewportSize()?.width ?? 0;
  const chatVisible = await s.pagina.locator(SEL.composer).first().isVisible();
  ctx.check('el ícono abre el panel a la derecha y el chat sigue visible',
    Boolean(caja) && caja.x > ancho / 2 && chatVisible,
    { evidencia: await ctx.captura(s, 'abierto'), datos: { x: caja?.x, ancho, chatVisible } });

  await s.pagina.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {});
  await s.pagina.keyboard.press('Control+b');
  await s.pagina.waitForTimeout(300);
  const cerrado = (await panel(s).count()) === 0;
  await s.pagina.keyboard.press('Control+b');
  await s.pagina.waitForTimeout(300);
  const reabierto = (await panel(s).count()) === 1;
  ctx.check('Ctrl+B lo cierra y lo vuelve a abrir', cerrado && reabierto,
    { evidencia: await ctx.captura(s, 'tras-ctrl-b'), datos: { cerrado, reabierto } });
}
