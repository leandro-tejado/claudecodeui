// Commits del 7-oct 851b86e1/cc5decc2/235d4126: las sesiones nacen con un
// título humano (titulo-humano.ts, sin cuota) en vez del prompt crudo
// cortado, y tmux lo lleva al lado del nombre fijo del pane en la opción
// `@titulo` (tmux-titulo.service.ts) — el nombre de tmux no cambia, lo usan
// el bridge y `claude-tmux`. El modo bash del CLI (`!comando`) queda en el
// transcript envuelto en `<bash-input>…</bash-input>`; sin el fix de
// 235d4126, tituloHumano no lo reconocía y la fila quedaba con esas
// etiquetas crudas como nombre.
//
// Los dos mensajes de este escenario están elegidos para que el título sea
// determinista con la regla de titulo-humano.ts, no adivinado a ojo:
//
// - Prosa sin relleno inicial ni coma temprana: `tituloDeProsa` se queda con
//   la frase entera (sin el punto final), recortada a 50 y con mayúscula
//   inicial. "Explicame en una frase qué es un psicrómetro." → "Explicame en
//   una frase qué es un psicrómetro" (44 caracteres, no hay conector final
//   que cortar).
// - Modo bash (`!echo hola-<nonce>`): `bashTranscript` saca el comando de
//   `<bash-input>echo hola-<nonce></bash-input>`, pasa por el camino
//   `mensaje.startsWith('!')` y da literal `Comando: echo hola-<nonce>`.
import { execFileSync } from 'node:child_process';
import { nonce, mostrarTodasLasSesiones, filaProyecto } from '../../lib/chat.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';
import { cerrarTmux } from '../../sesiones.mjs';

export const meta = {
  descripcion: 'título humano al nacer + @titulo de tmux; el modo bash no deja etiquetas crudas',
  puerto: 3901, cuota: true, tmux: true,
  checks: [
    'la fila de la barra muestra el título humano, no el prompt crudo ni un id',
    'tmux show-options -v @titulo devuelve ese mismo título',
    'un mensaje en modo bash (<bash-input>) no deja un título crudo con etiquetas en la barra',
    'tmux show-options -v @titulo del modo bash tampoco queda crudo',
  ],
};

const MENSAJE_PROSA = 'Explicame en una frase qué es un psicrómetro.';
const TITULO_PROSA_ESPERADO = 'Explicame en una frase qué es un psicrómetro';

function leerTituloTmux(nombreSesionTmux) {
  try {
    return execFileSync('tmux', ['show-options', '-t', `=${nombreSesionTmux}:`, '-v', '@titulo'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// `prepararTmux` ya deja la página en `/session/<sid>` (no en `/`, como
// `orquestador.mjs`): el árbol del proyecto puede venir ya expandido por la
// sesión activa. Clickear la fila del proyecto a ciegas la puede colapsar en
// vez de expandirla, así que solo se clickea si la fila todavía no se ve.
async function asegurarFilaVisible(s, sid) {
  await mostrarTodasLasSesiones(s);
  if (await s.pagina.locator(`a[href$="/session/${sid}"]`).count()) return;
  await filaProyecto(s).click().catch(() => {});
  await s.pagina.waitForTimeout(500);
}

// Fila de la barra para una sesión (su `<a href="/session/<sid>">`), con
// reintento: el sync del título corre sobre el transcript, no es instantáneo
// con el envío. `SkinSidebar.tsx` pinta el título en el único `span.truncate`
// de esa fila (el otro texto de la fila —el rótulo de estado— no lleva esa
// clase).
async function tituloEnBarra(s, sid, topeMs = 45_000) {
  await asegurarFilaVisible(s, sid);
  const loc = s.pagina.locator(`a[href$="/session/${sid}"] span.truncate`).first();
  const t0 = Date.now();
  let visto = null;
  while (Date.now() - t0 < topeMs) {
    if (await loc.count().catch(() => 0)) {
      const texto = (await loc.textContent().catch(() => null))?.trim();
      if (texto) {
        visto = texto;
        // Provisorio (no "definitivo"): un `ai-title` que llegue después lo
        // puede reemplazar una vez. Alcanza con verlo una vez estable.
        if (texto !== 'Sesión sin título' && texto !== sid) return texto;
      }
    }
    await s.pagina.waitForTimeout(500);
  }
  return visto;
}

export async function correr(ctx) {
  // Sesión 1: primer mensaje en prosa, título predecible.
  const { s, nombre: nombreProsa, sid: sidProsa } = await prepararTmux(ctx, 'e2e-nombre-prosa');
  const caja = s.pagina.locator('textarea').first();
  await caja.click();
  await caja.fill(MENSAJE_PROSA);
  await caja.press('Enter');

  const tituloProsa = await tituloEnBarra(s, sidProsa);
  const capProsa = await ctx.captura(s, 'barra-prosa');
  ctx.check(
    'la fila de la barra muestra el título humano, no el prompt crudo ni un id',
    tituloProsa === TITULO_PROSA_ESPERADO,
    { evidencia: capProsa, datos: { tituloProsa, esperado: TITULO_PROSA_ESPERADO, mensaje: MENSAJE_PROSA } },
  );

  const tituloTmuxProsa = leerTituloTmux(nombreProsa);
  ctx.check(
    'tmux show-options -v @titulo devuelve ese mismo título',
    tituloTmuxProsa === TITULO_PROSA_ESPERADO,
    { datos: { tituloTmuxProsa, esperado: TITULO_PROSA_ESPERADO, nombre: nombreProsa } },
  );

  // Se cierra antes de abrir la segunda: `prepararTmux` espera (hasta 30 s y
  // después mata a la fuerza) a que el proyecto de prueba quede sin `claude`
  // antes de crear el próximo pane, y acá ya no hace falta mantenerla viva.
  cerrarTmux(nombreProsa);

  // Sesión 2: primer mensaje en modo bash del CLI (`!comando`), pane nuevo
  // para que el modo bash sea de verdad el primer mensaje: `elegirTitulo`
  // solo mira `firstPrompt` (o el último/historial si el primero no da
  // título), nunca un mensaje intermedio.
  const n = nonce();
  const comandoBash = `echo hola-${n}`;
  const tituloBashEsperado = `Comando: ${comandoBash}`;
  const { s: s2, nombre: nombreBash, sid: sidBash } = await prepararTmux(ctx, 'e2e-nombre-bash');
  const caja2 = s2.pagina.locator('textarea').first();
  await caja2.click();
  await caja2.fill(`!${comandoBash}`);
  await caja2.press('Enter');

  const tituloBash = await tituloEnBarra(s2, sidBash);
  const capBash = await ctx.captura(s2, 'barra-bash');
  const sinEtiquetasCrudas = typeof tituloBash === 'string' && !tituloBash.includes('<') && !tituloBash.includes('bash-input');
  ctx.check(
    'un mensaje en modo bash (<bash-input>) no deja un título crudo con etiquetas en la barra',
    tituloBash === tituloBashEsperado && sinEtiquetasCrudas,
    { evidencia: capBash, datos: { tituloBash, esperado: tituloBashEsperado, sinEtiquetasCrudas } },
  );

  const tituloTmuxBash = leerTituloTmux(nombreBash);
  const tmuxSinEtiquetasCrudas = typeof tituloTmuxBash === 'string' && !tituloTmuxBash.includes('<') && !tituloTmuxBash.includes('bash-input');
  ctx.check(
    'tmux show-options -v @titulo del modo bash tampoco queda crudo',
    tituloTmuxBash === tituloBashEsperado && tmuxSinEtiquetasCrudas,
    { datos: { tituloTmuxBash, esperado: tituloBashEsperado, nombre: nombreBash } },
  );
}
