// Fase 11, paso 6: axe sobre el chat y el cuestionario, en las cuatro variantes.
// Cuentan solo las violaciones `serious` y `critical`; el resto queda en los datos.
import { VARIANTES, sesionConGuion, axeGraves } from '../../lib/visual.mjs';
import { opcion } from '../visual/cuestionario.mjs';

export const meta = { descripcion: 'axe sin violaciones serias o críticas en chat y cuestionario', puerto: 3902 };

export async function correr(ctx) {
  for (const v of VARIANTES) {
    const chat = await sesionConGuion(ctx, v, 'guion:markdown');
    const enChat = await axeGraves(chat.pagina);
    ctx.check(`chat ${v.nombre}: axe sin serias ni críticas`, enChat.length === 0, { datos: enChat });

    const preg = await sesionConGuion(ctx, v, 'guion:pregunta', { hasta: (x) => opcion(x, 'Azul') });
    const enPreg = await axeGraves(preg.pagina);
    ctx.check(`cuestionario ${v.nombre}: axe sin serias ni críticas`, enPreg.length === 0, { datos: enPreg });
  }
}
