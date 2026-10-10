// Plan 09-oct, Fase 6: las 8 capturas «después» (1280 y 390 px × claro y
// oscuro × con y sin `prefers-reduced-motion`), con una sesión abierta para
// que se vean cabecera, barra y compositor juntos.
import fs from 'node:fs';
import path from 'node:path';

import { abrirSesion, crearSesionFalsa } from '../../lib/chat.mjs';

const DESTINO = new URL('../../evidencia/09-vista-principal/99-despues/', import.meta.url).pathname;

export const meta = {
  descripcion: '8 capturas «después» de la vista principal',
  puerto: 3902,
  checks: ['8 capturas en 99-despues'],
};

export async function correr(ctx) {
  fs.mkdirSync(DESTINO, { recursive: true });
  const id = crearSesionFalsa('guion:markdown nonce:capturas');
  const hechas = [];
  for (const viewport of ['escritorio', 'movil']) {
    for (const tema of ['light', 'dark']) {
      for (const movimiento of ['no-preference', 'reduce']) {
        const s = await ctx.abrir({ viewport, tema });
        await s.pagina.emulateMedia({ reducedMotion: movimiento });
        await abrirSesion(s, id);
        await s.pagina.waitForTimeout(800);
        const nombre = `${viewport === 'escritorio' ? '1280' : '390'}-${tema === 'light' ? 'claro' : 'oscuro'}${movimiento === 'reduce' ? '-reducido' : ''}.png`;
        await s.pagina.screenshot({ path: path.join(DESTINO, nombre) });
        hechas.push(nombre);
        await s.navegador.close();
      }
    }
  }
  ctx.check('8 capturas en 99-despues', hechas.length === 8, { datos: { hechas } });
}
