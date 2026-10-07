// Fase 11, paso 6: header (cuota 5 h y semanal) y barra de sesiones en las cuatro
// variantes, contra el boceto aprobado 05-octubre-header-barra.html. Siembra un
// cuota.json conocido para que el indicador tenga qué mostrar.
import fs from 'node:fs';
import { CUOTA_JSON } from '../../lib/config.mjs';
import { mostrarTodasLasSesiones } from '../../lib/chat.mjs';
import { VARIANTES, sesionConGuion, chequearVariante } from '../../lib/visual.mjs';

export const meta = { descripcion: 'header y barra a 390/1280, claro/oscuro, contra el boceto', puerto: 3902 };

function sembrarCuota() {
  const ahora = Math.floor(Date.now() / 1000);
  fs.writeFileSync(`${CUOTA_JSON}.tmp`, JSON.stringify({
    ts: ahora, origen: 'statusline', maquina: 'vps',
    five_hour: 41, five_hour_resets_at: ahora + 3 * 3600,
    seven_day: 72, seven_day_resets_at: ahora + 4 * 86400, ctx: 1,
  }));
  fs.renameSync(`${CUOTA_JSON}.tmp`, CUOTA_JSON);
}

export async function correr(ctx) {
  sembrarCuota();
  for (const v of VARIANTES) {
    const s = await sesionConGuion(ctx, v, 'guion:humo');
    await s.pagina.reload();
    await s.pagina.waitForTimeout(1500);
    if (v.viewport === 'escritorio') await mostrarTodasLasSesiones(s);
    await s.pagina.waitForTimeout(500);
    const cap = await ctx.captura(s, `header-${v.nombre}`);
    const ind = s.pagina.locator('button[title*="Ventana de 5 horas"]').filter({ visible: true }).first();
    const visible = await ind.isVisible().catch(() => false);
    const texto = visible ? (await ind.innerText()).replace(/\s+/g, ' ') : '';
    ctx.check(`header ${v.nombre}: la cuota de 5 h se ve con su %`, visible && /41\s*%/.test(texto), { evidencia: cap, datos: { texto } });
    if (v.viewport === 'escritorio') {
      const rotulos = await s.pagina.getByTestId('session-estado-rotulo').count();
      ctx.check(`barra ${v.nombre}: las sesiones muestran su estado`, rotulos > 0, { evidencia: cap, datos: { rotulos } });
    }
    await chequearVariante(ctx, s, `header ${v.nombre}`, cap);
  }
}
