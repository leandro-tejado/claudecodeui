// Plan 09-oct, Fase 4: el compositor quedó en cuatro controles. Adjuntar, `/`
// para comandos y `@` para archivos tienen que seguir andando igual.
import fs from 'node:fs';
import path from 'node:path';

import { abrirProyecto, SEL } from '../../lib/chat.mjs';
import { PROYECTO } from '../../lib/config.mjs';

export const meta = {
  descripcion: 'compositor de cuatro controles: adjuntos, / y @ siguen funcionando',
  puerto: 3902,
  checks: [
    'el compositor vacío muestra ≤ 4 controles',
    'adjuntar un archivo lo muestra en el compositor',
    '/ abre el menú de comandos',
    '@ abre la lista de archivos',
    'ninguna de las cuatro frases viejas en la pantalla',
  ],
};

export async function correr(ctx) {
  // `@` lista los archivos del proyecto: el de prueba nace vacío y sin esto
  // la lista no tiene qué mostrar.
  fs.mkdirSync(path.join(PROYECTO, 'src'), { recursive: true });
  fs.writeFileSync(path.join(PROYECTO, 'src', 'ejemplo.ts'), 'export const x = 1;\n');
  const s = await ctx.abrir();
  await abrirProyecto(s);
  const form = s.pagina.locator('form').filter({ has: s.pagina.locator(SEL.composer) }).first();
  const controles = await form.locator('button:visible').count();
  ctx.check('el compositor vacío muestra ≤ 4 controles', controles <= 4, { evidencia: await ctx.captura(s, 'vacio'), datos: { controles } });

  const texto = await s.pagina.locator('body').innerText();
  const viejas = ['Elige tu asistente', 'Selecciona un proveedor', 'Listo para usar', 'Pulsa'].filter((f) => texto.includes(f));
  ctx.check('ninguna de las cuatro frases viejas en la pantalla', viejas.length === 0, { datos: { viejas } });

  await form.locator('input[type="file"]').setInputFiles({ name: 'nota-e2e.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
  const adjunto = await s.pagina.getByText('nota-e2e.txt').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  ctx.check('adjuntar un archivo lo muestra en el compositor', adjunto, { evidencia: await ctx.captura(s, 'adjunto') });

  const area = s.pagina.locator(SEL.composer).first();
  await area.fill('');
  await area.type('/');
  const comandos = await s.pagina.locator('[role="listbox"], [data-command-menu], #command-menu').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  ctx.check('/ abre el menú de comandos', comandos, { evidencia: await ctx.captura(s, 'comandos') });

  await s.pagina.keyboard.press('Escape');
  await area.fill('');
  await area.type('@');
  await s.pagina.waitForTimeout(1500);
  const archivos = await s.pagina.locator('.font-mono').filter({ hasText: /\// }).count();
  const sinArchivos = archivos === 0 ? await area.inputValue() : '';
  ctx.check('@ abre la lista de archivos', archivos > 0, { evidencia: await ctx.captura(s, 'archivos'), datos: { archivos, valor: sinArchivos } });
}
