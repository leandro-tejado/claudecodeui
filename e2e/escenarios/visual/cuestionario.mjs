// Fase 11, paso 6: el Cuestionario abierto en las cuatro variantes, contra el
// boceto 05-octubre-cuestionario.html. El guion `pregunta` deja el turno esperando.
import { VARIANTES, sesionConGuion, chequearVariante } from '../../lib/visual.mjs';

export const meta = { descripcion: 'cuestionario a 390/1280, claro/oscuro, contra el boceto', puerto: 3902 };

export const opcion = (s, texto) => s.pagina.getByRole('button', { name: new RegExp(`^\\s*\\d*\\s*${texto}`) }).last();

export async function correr(ctx) {
  for (const v of VARIANTES) {
    const s = await sesionConGuion(ctx, v, 'guion:pregunta', { hasta: (x) => opcion(x, 'Azul') });
    const cap = await ctx.captura(s, `cuestionario-${v.nombre}`);
    const caja = await opcion(s, 'Azul').boundingBox();
    ctx.check(`cuestionario ${v.nombre}: la opción entra en pantalla`,
      !!caja && caja.x >= 0 && caja.x + caja.width <= s.pagina.viewportSize().width, { evidencia: cap, datos: caja });
    await chequearVariante(ctx, s, `cuestionario ${v.nombre}`, cap);
  }
}
