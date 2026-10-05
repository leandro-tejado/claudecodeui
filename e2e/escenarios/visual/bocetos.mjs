// Fase 10, paso 8: los bocetos de design-system/visual-refs se ven bien a 390 y 1280,
// claro y oscuro, sin scroll horizontal. Son HTML autocontenidos (sin servidor de por
// medio): se abren directo con file://, lanzando Chromium a mano en vez de pasar por
// ctx.abrir() (que supone una instancia de CloudCLI viva con token — acá no hace falta).
//
// Tolera que el boceto del cuestionario (05-octubre-cuestionario.html) todavía no exista:
// el paso 6 de la Fase 10 lo deja bloqueado a propósito, a la espera del prompt de ejemplo
// de Leandro. Su ausencia se anota como "bloqueado" (ctx.bloquear), nunca como "falla".
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CHROMIUM, REPO } from '../../lib/config.mjs';
import { VIEWPORTS } from '../../lib/navegador.mjs';

const DIR = path.join(REPO, 'design-system', 'visual-refs');

const BOCETOS = [
  { archivo: '05-octubre-chat.html', nombre: 'chat' },
  { archivo: '05-octubre-header-barra.html', nombre: 'header-barra' },
  { archivo: '05-octubre-cuestionario.html', nombre: 'cuestionario', opcional: true },
];

export const meta = {
  descripcion: 'bocetos del design system (Optimum + Apple) a 390/1280, claro/oscuro, sin scroll horizontal',
  // El único nombre que usa ctx.bloquear(): cuando falta el boceto opcional, se agrega UNA
  // fila "bloqueado" con este nombre. Los bocetos que sí existen van por ctx.check(), con
  // su propio nombre por boceto/viewport/tema — bloquear() no los toca.
  checks: ['cuestionario: boceto todavía no existe (paso 6 de la Fase 10, bloqueado por el ejemplo de Leandro)'],
};

export async function correr(ctx) {
  const navegador = await chromium.launch({ executablePath: CHROMIUM });
  try {
    for (const boceto of BOCETOS) {
      const ruta = path.join(DIR, boceto.archivo);
      if (!fs.existsSync(ruta)) {
        if (boceto.opcional) {
          ctx.bloquear(`${boceto.archivo} no existe todavía (Fase 10, paso 6: espera el prompt de ejemplo de Leandro)`);
          continue;
        }
        ctx.check(`${boceto.nombre}: el archivo existe`, false, { datos: `falta design-system/visual-refs/${boceto.archivo}` });
        continue;
      }

      for (const viewport of ['movil', 'escritorio']) {
        for (const tema of ['light', 'dark']) {
          const contexto = await navegador.newContext({
            viewport: VIEWPORTS[viewport],
            colorScheme: tema,
            deviceScaleFactor: 1,
          });
          const pagina = await contexto.newPage();
          const erroresConsola = [];
          pagina.on('pageerror', (e) => erroresConsola.push(String(e)));
          pagina.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()); });

          await pagina.goto(`file://${ruta}`);
          // Deja asentar fuentes del sistema y la hoja de estilos antes de medir: un layout
          // a medio aplicar puede reportar un ancho que después se corrige solo.
          await pagina.waitForTimeout(150);

          const desborde = await pagina.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          const cap = await ctx.captura({ pagina }, `${boceto.nombre}-${viewport}-${tema}`);

          ctx.check(`${boceto.nombre}: ${viewport}/${tema} sin scroll horizontal`, desborde <= 0, {
            evidencia: cap,
            datos: { desborde },
          });
          ctx.check(`${boceto.nombre}: ${viewport}/${tema} consola sin errores`, erroresConsola.length === 0, {
            evidencia: cap,
            datos: erroresConsola.slice(0, 3),
          });

          await contexto.close();
        }
      }
    }
  } finally {
    await navegador.close();
  }
}
