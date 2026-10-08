// Commit d27ef84c (7-oct): un mensaje con una captura adjunta en tmux se
// quedaba siempre sin Enter. `cuadroMuestra` (tmux-bridge.service.ts) buscaba
// los últimos 40 caracteres crudos del texto en el cuadro, pero Claude Code
// reemplaza la ruta de una imagen pegada por "[Image #N]" al principio del
// cuadro (medido con png/jpg/gif/webp): el final —la ruta del adjunto— nunca
// se veía y todo mensaje con una imagen caía en `no-aparecio`.
//
// Esto ejercita el camino real (composer → upload → chat.send-tmux →
// enviarPromptVerificado → pane de tmux con Claude de verdad), no los
// fixtures de pane que ya cubre tmux-cuadro-panes-reales.test.ts: esos
// prueban `cuadroMuestra` aislada, esto prueba que la UI + el server + un
// Claude real de punta a punta no se quedan pegados con un adjunto.
import fs from 'node:fs';
import path from 'node:path';
import { nonce, contarFilas, esperarFin } from '../../lib/chat.mjs';
import { prepararTmux, filasTranscript } from '../../lib/tmux.mjs';
import { RAIZ_TMP } from '../../lib/config.mjs';

export const meta = {
  descripcion: 'mensaje con imagen(es) adjunta(s) en tmux: ya no da "no apareció" y Claude las lee',
  puerto: 3901, cuota: true, tmux: true,
  checks: [
    'el mensaje del usuario aparece una vez en el DOM (una imagen)',
    'no aparece el error de "no apareció" en el DOM (una imagen)',
    'el JSONL tiene la fila user con el nonce y un bloque de imagen (una imagen)',
    'Claude contesta (una imagen)',
    'el mensaje del usuario aparece una vez en el DOM (dos imágenes)',
    'no aparece el error de "no apareció" en el DOM (dos imágenes)',
    'el JSONL tiene la fila user con el nonce y un bloque de imagen (dos imágenes)',
    'Claude contesta (dos imágenes)',
  ],
};

// El texto exacto de tmux-bridge.service.ts (motivo `no-aparecio`), el que
// hacía 100% de los mensajes con una imagen antes del fix.
const ERROR_NO_APARECIO = 'El texto no apareció en el cuadro de la sesión';

// PNG 1x1 (68 bytes), para no depender de nada fuera del escenario ni de una
// captura real que podría cambiar de tamaño. El composer solo mira
// `file.type` (`image/png`) para la miniatura; a Claude Code le alcanza para
// describir un solo píxel.
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';

function escribirPng(nombre) {
  fs.mkdirSync(RAIZ_TMP, { recursive: true });
  const destino = path.join(RAIZ_TMP, nombre);
  fs.writeFileSync(destino, Buffer.from(PNG_1X1_BASE64, 'base64'));
  return destino;
}

// Como lo haría Leandro: elige el/los archivo(s) en el input oculto de
// react-dropzone (ChatComposer.tsx, `<input {...getInputProps()}
// aria-label="Adjuntar archivos">`), escribe el texto y manda Enter — mismo
// camino que `escribirYEnviar` de lib/chat.mjs, con el adjunto antes.
async function enviarConAdjuntos(s, texto, rutas) {
  // Acotado al form del composer (el que tiene el textarea): evita chocar con
  // otro input[type=file] que pudiera montarse en otro panel (skills, etc.).
  const input = s.pagina.locator('form:has(textarea) input[type="file"]').first();
  await input.setInputFiles(rutas);
  // Miniatura/chip del adjunto (ComposerAttachment.tsx) antes de escribir:
  // así manda el mensaje una persona, no apenas soltó el archivo.
  await s.pagina.waitForTimeout(500);
  const caja = s.pagina.locator('textarea').first();
  await caja.click();
  if (texto) await caja.fill(texto);
  const t = Date.now();
  await caja.press('Enter');
  return t;
}

async function esperar(cond, topeMs, pasoMs = 300) {
  const t0 = Date.now();
  while (Date.now() - t0 < topeMs) {
    const v = await cond();
    if (v) return v;
    await new Promise((r) => setTimeout(r, pasoMs));
  }
  return null;
}

// Fila `user` del JSONL cuyo contenido incluye el nonce — escrita por el
// propio Claude Code (no por este server), con un bloque `{"type":"image",
// "source":{"type":"base64", ...}}` por cada adjunto que leyó.
function filaUserConNonce(sid, n) {
  const filas = filasTranscript(sid);
  return filas.find((f) => f.type === 'user' && JSON.stringify(f.message?.content ?? '').includes(n));
}

export async function correr(ctx) {
  const { s, sid } = await prepararTmux(ctx, 'e2e-adjunto');

  const casos = [
    { etiqueta: 'una imagen', archivos: ['adjunto-1.png'], texto: (n) => `¿De qué color es la imagen? Al final escribí ${n}` },
    { etiqueta: 'dos imágenes', archivos: ['adjunto-2a.png', 'adjunto-2b.png'], texto: (n) => `¿Cuántas imágenes te mandé? Al final escribí ${n}` },
  ];

  for (const caso of casos) {
    const n = nonce();
    const rutas = caso.archivos.map(escribirPng);
    const texto = caso.texto(n);
    const t = await enviarConAdjuntos(s, texto, rutas);

    await esperar(() => contarFilas(s, n, 'user'), 60_000);
    const cap = await ctx.captura(s, `dom-${caso.archivos.length}`);

    const filasUser = await contarFilas(s, n, 'user');
    ctx.check(`el mensaje del usuario aparece una vez en el DOM (${caso.etiqueta})`, filasUser === 1, { evidencia: cap, datos: { filasUser } });

    const filasError = await contarFilas(s, ERROR_NO_APARECIO, 'error');
    ctx.check(`no aparece el error de "no apareció" en el DOM (${caso.etiqueta})`, filasError === 0, { evidencia: cap, datos: { filasError } });

    const filaUser = await esperar(() => filaUserConNonce(sid, n), 20_000);
    const tieneBloqueImagen = Boolean(filaUser) && JSON.stringify(filaUser.message.content).includes('"type":"image"');
    ctx.guardar(`jsonl-${caso.archivos.length}.json`, filaUser ?? { encontrada: false });
    ctx.check(`el JSONL tiene la fila user con el nonce y un bloque de imagen (${caso.etiqueta})`, Boolean(filaUser) && tieneBloqueImagen, { datos: { filaUser: Boolean(filaUser), tieneBloqueImagen } });

    const finMs = await esperarFin(s, t, 90_000);
    ctx.check(`Claude contesta (${caso.etiqueta})`, finMs !== null, { evidencia: await ctx.captura(s, `respuesta-${caso.archivos.length}`), datos: { finMs } });
  }
}
