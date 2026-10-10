// Plan 09-oct, Fase 9: el árbol de Archivos, el documento abierto y el
// compositor hablan el mismo idioma visual que el resto (tokens ds-*), en los
// dos temas. Los colores se comparan contra el token resuelto en la página, no
// contra un hex escrito acá: así el check sigue valiendo si la marca cambia.
import fs from 'node:fs';
import path from 'node:path';

import { abrirSesion, crearSesionFalsa, SEL } from '../../lib/chat.mjs';
import { PROYECTO } from '../../lib/config.mjs';

export const meta = {
  descripcion: 'árbol de archivos, documento y compositor con la marca',
  puerto: 3902,
  checks: [
    'claro: la carpeta abierta del árbol usa el primario de marca',
    'claro: la cita del documento lleva el acento de marca y el fondo es la superficie',
    'claro: el compositor mide lo mismo que la columna de lectura',
    'oscuro: la carpeta abierta del árbol usa el primario de marca',
    'oscuro: la cita del documento lleva el acento de marca y el fondo es la superficie',
    'oscuro: el compositor mide lo mismo que la columna de lectura',
  ],
};

const DOC = `# Guía de prueba

Un párrafo con **negrita** y un [enlace](https://example.com).

> La cita lleva el acento de marca.

| Archivo | Estado |
|---|---|
| uno.ts | listo |
`;

const token = (s, nombre) =>
  s.pagina.evaluate((n) => {
    // Resuelve la variable a rgb() con un elemento de prueba: getPropertyValue da el hex crudo.
    const el = document.createElement('div');
    el.style.color = `var(${n})`;
    document.body.appendChild(el);
    const valor = getComputedStyle(el).color;
    el.remove();
    return valor;
  }, nombre);

export async function correr(ctx) {
  fs.mkdirSync(path.join(PROYECTO, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(PROYECTO, 'docs', 'guia.md'), DOC);
  const id = crearSesionFalsa('guion:markdown nonce:documentos');

  for (const tema of ['light', 'dark']) {
    const rotulo = tema === 'light' ? 'claro' : 'oscuro';
    const s = await ctx.abrir({ tema });
    await abrirSesion(s, id);
    await s.pagina.waitForTimeout(600);

    // Columna de lectura contra la caja del compositor, con el panel cerrado.
    const columna = await s.pagina.locator('.chat-messages-pane > div.max-w-3xl').first().boundingBox().catch(() => null);
    const compositor = await s.pagina.locator(SEL.composer).first()
      .evaluate((el) => el.closest('.max-w-\\[46rem\\]')?.getBoundingClientRect().toJSON() ?? null).catch(() => null);
    const anchoColumna = columna ? columna.width - 32 : null; // px-4 a cada lado
    ctx.check(`${rotulo}: el compositor mide lo mismo que la columna de lectura`,
      Boolean(columna && compositor) && Math.abs(compositor.width - anchoColumna) <= 2 && Math.abs(compositor.x - (columna.x + 16)) <= 2,
      { datos: { columna, compositor } });

    const panel = s.pagina.locator('[role="separator"][aria-label="Ajustar el ancho del panel de archivos"]');
    if (!(await panel.count())) await s.pagina.getByRole('button', { name: 'Archivos del proyecto' }).click();
    await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const carpeta = s.pagina.getByText('docs', { exact: true }).first();
    await carpeta.click();
    await s.pagina.getByText('guia.md', { exact: true }).first().waitFor({ timeout: 5000 }).catch(() => {});
    const primario = await token(s, '--ds-primary');
    const colorCarpeta = await carpeta.evaluate((el) => {
      const svg = el.closest('div')?.querySelector('svg.lucide-folder-open');
      return svg ? getComputedStyle(svg).color : null;
    }).catch(() => null);
    ctx.check(`${rotulo}: la carpeta abierta del árbol usa el primario de marca`, colorCarpeta === primario,
      { evidencia: await ctx.captura(s, `arbol-${rotulo}`), datos: { colorCarpeta, primario } });

    // Al abrir un archivo el editor ocupa el lugar del panel.
    await s.pagina.getByText('guia.md', { exact: true }).first().click();

    await s.pagina.getByTitle(/preview markdown|vista previa/i).first().click({ timeout: 5000 }).catch(() => {});
    const cita = s.pagina.locator('blockquote', { hasText: 'acento de marca' }).first();
    await cita.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const superficie = await s.pagina.evaluate(() => {
      const el = document.createElement('div');
      el.style.backgroundColor = 'var(--ds-surface)';
      document.body.appendChild(el);
      const v = getComputedStyle(el).backgroundColor;
      el.remove();
      return v;
    });
    const estilos = await cita.evaluate((el) => ({
      borde: getComputedStyle(el).borderLeftColor,
      fondo: getComputedStyle(el.closest('.overflow-y-auto')).backgroundColor,
    })).catch(() => null);
    ctx.check(`${rotulo}: la cita del documento lleva el acento de marca y el fondo es la superficie`,
      estilos?.borde === primario && estilos?.fondo === superficie,
      { evidencia: await ctx.captura(s, `documento-${rotulo}`), datos: { estilos, primario, superficie } });
    await s.navegador.close();
  }
}
