// Panel de Salidas: anchos ajustables arrastrando (panel entero y columna de
// la lista, persistidos al recargar) y "abrir en pestaña nueva" de la vista
// previa. El HTML de prueba intenta leer el token de localStorage: en la
// pestaña nueva tiene que seguir en el iframe sandbox, sin el origen de la app.
import fs from 'node:fs';
import path from 'node:path';
import { PROYECTO } from '../../lib/config.mjs';
import { abrirProyecto, nonce } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'Salidas: manijas de ancho persistentes y vista previa en pestaña nueva',
  puerto: 3902,
  contraReal: true, // solo UI y un archivo en el proyecto descartable: no habla con el CLI
  checks: [
    'arrastrar el borde izquierdo agranda el panel de Salidas',
    'arrastrar la manija entre lista y vista previa agranda la lista',
    'los dos anchos sobreviven a recargar la página',
    '"Pestaña nueva" abre la salida HTML renderizada en otra pestaña',
    'el HTML abierto en la pestaña nueva no puede leer el localStorage de la app',
  ],
};

async function ancho(locator) {
  return Math.round((await locator.boundingBox())?.width ?? 0);
}

async function arrastrar(pagina, manija, dx) {
  const caja = await manija.boundingBox();
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  await pagina.mouse.move(x, y);
  await pagina.mouse.down();
  for (let i = 1; i <= 10; i++) await pagina.mouse.move(x + (dx * i) / 10, y);
  await pagina.mouse.up();
}

export async function correr(ctx) {
  const n = nonce();
  const dir = path.join(PROYECTO, '.informes');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = `e2e-salida-${n}.html`;
  fs.writeFileSync(path.join(dir, archivo), `<!doctype html><html><head><meta charset="utf-8"><title>salida ${n}</title></head>
<body><h1 id="marca">Salida de prueba ${n}</h1><p id="origen"></p>
<script>
  var r;
  try { r = 'LEYO:' + Object.keys(localStorage).length; } catch (e) { r = 'BLOQUEADO'; }
  document.getElementById('origen').textContent = r;
</script></body></html>`);

  // El archivo queda en el proyecto descartable: nombre con nonce, no pisa nada.
  {
    const s = await ctx.abrir();
    await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
    await s.pagina.evaluate(() => {
      for (const k of ['chat:salidas-panel-width', 'chat:salidas-lista-width']) localStorage.removeItem(k);
      localStorage.setItem('chat:salidas-panel-open', '1');
    });
    await abrirProyecto(s);

    const pagina = s.pagina;
    const manijaPanel = pagina.getByRole('separator', { name: 'Ajustar el ancho del panel de Salidas' });
    await manijaPanel.waitFor({ state: 'visible', timeout: 15_000 });
    const panel = manijaPanel.locator('xpath=..');
    await pagina.getByRole('button', { name: 'Actualizar' }).click().catch(() => {});
    await pagina.getByText(archivo, { exact: true }).first().click({ timeout: 15_000 });
    const lista = pagina.locator('[style*="--salidas-lista"]').first();

    const panelAntes = await ancho(panel);
    const listaAntes = await ancho(lista);
    const capAntes = await ctx.captura(s, 'antes-de-arrastrar');

    await arrastrar(pagina, manijaPanel, -300);
    const panelDespues = await ancho(panel);
    ctx.check('arrastrar el borde izquierdo agranda el panel de Salidas', panelDespues >= panelAntes + 250, {
      evidencia: [capAntes, await ctx.captura(s, 'panel-agrandado')],
      datos: { panelAntes, panelDespues },
    });

    const manijaLista = pagina.getByRole('separator', { name: 'Ajustar el ancho de la lista de salidas' });
    await arrastrar(pagina, manijaLista, 120);
    const listaDespues = await ancho(lista);
    ctx.check('arrastrar la manija entre lista y vista previa agranda la lista', listaDespues >= listaAntes + 100, {
      evidencia: [await ctx.captura(s, 'lista-agrandada')],
      datos: { listaAntes, listaDespues },
    });

    await pagina.reload({ waitUntil: 'networkidle' });
    await abrirProyecto(s);
    await manijaPanel.waitFor({ state: 'visible', timeout: 15_000 });
    const panelRecarga = await ancho(panel);
    const listaRecarga = await ancho(lista);
    ctx.check('los dos anchos sobreviven a recargar la página',
      Math.abs(panelRecarga - panelDespues) <= 2 && Math.abs(listaRecarga - listaDespues) <= 2, {
        evidencia: [await ctx.captura(s, 'despues-de-recargar')],
        datos: { panelDespues, panelRecarga, listaDespues, listaRecarga },
      });

    await pagina.getByText(archivo, { exact: true }).first().click();
    const boton = pagina.getByRole('button', { name: 'Abrir en pestaña nueva' });
    await boton.waitFor({ state: 'visible' });
    await pagina.waitForFunction(
      () => !document.querySelector('button[aria-label="Abrir en pestaña nueva"]')?.disabled,
      null, { timeout: 15_000 },
    );
    const [nueva] = await Promise.all([pagina.context().waitForEvent('page', { timeout: 10_000 }), boton.click()]);
    await nueva.waitForLoadState('load');
    const marco = nueva.frameLocator('iframe');
    const titulo = await marco.locator('#marca').textContent({ timeout: 10_000 }).catch(() => null);
    const origen = await marco.locator('#origen').textContent({ timeout: 10_000 }).catch(() => null);
    const sandbox = await nueva.locator('iframe').getAttribute('sandbox').catch(() => null);
    await nueva.screenshot({ path: path.join(ctx.dir, 'pestana-nueva.png') });
    const capNueva = path.join(path.basename(ctx.dir), 'pestana-nueva.png');

    ctx.check('"Pestaña nueva" abre la salida HTML renderizada en otra pestaña', titulo === `Salida de prueba ${n}`, {
      evidencia: [capNueva], datos: { url: nueva.url().slice(0, 40), titulo },
    });
    ctx.check('el HTML abierto en la pestaña nueva no puede leer el localStorage de la app',
      origen === 'BLOQUEADO' && sandbox === 'allow-scripts allow-popups', {
        evidencia: [capNueva], datos: { origen, sandbox },
      });
  }
}
