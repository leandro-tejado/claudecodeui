// Commit 7475c447 (7-oct): "dormida" se decidía solo por la edad del último
// cambio (más de 10 min) y una sesión con su pane de tmux vivo, esperando el
// próximo mensaje, figuraba "dormida" igual. Ahora `estadoDeSesion`
// (src/modules/sidebar/estadoSesion.ts) manda `procesoVivo` cuando hay tmux:
// vivo → libre, muerto → dormida. El vigía (vigia-tmux.service.ts, cada 10 s,
// `VIGIA_TMUX_INTERVALO_MS` en sessions-watcher.service.ts) cruza el registro
// contra `tmux list-sessions` de verdad y manda `session_upserted` cuando
// cambia, así que la fila cambia de estado sola, sin recargar.
import { dormirTmux } from '../../sesiones.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';
import { esperarFin, mostrarTodasLasSesiones, filaProyecto } from '../../lib/chat.mjs';

// El vigía corre cada 10 s (VIGIA_TMUX_INTERVALO_MS); se da el doble más
// margen por el ciclo de broadcast/React antes de declarar que no cambió.
const TOPE_CAMBIO_ESTADO_MS = 25_000;

export const meta = {
  descripcion: '"dormida" no aparece con el tmux vivo, y pasa a dormida en vivo al matar el pane',
  puerto: 3901, cuota: true, tmux: true,
  checks: [
    'con el tmux vivo, la fila NO dice "dormida"',
    `al matar el pane, la fila pasa a "dormida" sin recargar en ≤ ${TOPE_CAMBIO_ESTADO_MS} ms`,
  ],
};

function filaRotulo(s, sid) {
  return s.pagina.locator(`a[href$="/session/${sid}"] [data-testid="session-estado-rotulo"]`).first();
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

async function rotuloActual(s, sid) {
  const loc = filaRotulo(s, sid);
  if (!(await loc.count().catch(() => 0))) return null;
  return (await loc.textContent().catch(() => null))?.trim() ?? null;
}

async function esperarRotulo(s, sid, esperado, topeMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < topeMs) {
    if ((await rotuloActual(s, sid)) === esperado) return Date.now() - t0;
    await s.pagina.waitForTimeout(300);
  }
  return null;
}

export async function correr(ctx) {
  const { s, nombre, sid } = await prepararTmux(ctx, 'e2e-estado');

  // La barra filtra "solo tmux vivo" por defecto: sin apagar el filtro, una
  // sesión que se acaba de dormir desaparece de la lista en vez de quedar
  // visible como "dormida" (que es justo lo que este escenario mide).
  await asegurarFilaVisible(s, sid);

  // Un turno corto para que la sesión asiente en "libre" (turno cerrado, pane
  // vivo) antes de medir: recién creada puede todavía figurar "pensando".
  const caja = s.pagina.locator('textarea').first();
  await caja.click();
  await caja.fill('Respondé solo con: listo');
  const t = Date.now();
  await caja.press('Enter');
  await esperarFin(s, t, 90_000);

  // Se asienta en libre (no dormida) antes de leer el check: el turno recién
  // cerrado puede tardar un instante en bajar de "pensando" a "libre".
  await esperarRotulo(s, sid, 'libre', 10_000);
  const rotuloConVida = await rotuloActual(s, sid);
  const capVivo = await ctx.captura(s, 'tmux-vivo');
  ctx.check(
    'con el tmux vivo, la fila NO dice "dormida"',
    rotuloConVida !== null && rotuloConVida !== 'dormida',
    { evidencia: capVivo, datos: { rotuloConVida } },
  );

  // Mata el pane (kill-session) sin tocar sesiones.json ("dormida" en
  // sesiones.json ≠ lo que mide este check: acá lo real es tmux, por
  // `tmux-registry-sessions.service.ts`). Sin recargar la página.
  const capAntesDormir = await ctx.captura(s, 'antes-dormir');
  const resultadoDormir = dormirTmux(nombre);
  const msHastaDormida = await esperarRotulo(s, sid, 'dormida', TOPE_CAMBIO_ESTADO_MS);
  const capDespuesDormir = await ctx.captura(s, 'despues-dormir');
  ctx.check(
    `al matar el pane, la fila pasa a "dormida" sin recargar en ≤ ${TOPE_CAMBIO_ESTADO_MS} ms`,
    msHastaDormida !== null,
    {
      evidencia: [capAntesDormir, capDespuesDormir],
      datos: { msHastaDormida, topeMs: TOPE_CAMBIO_ESTADO_MS, dormidaOk: resultadoDormir.cerrada, nombre, sid },
    },
  );
}
