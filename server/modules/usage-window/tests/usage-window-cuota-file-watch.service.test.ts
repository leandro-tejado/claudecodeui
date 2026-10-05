import assert from 'node:assert/strict';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

/**
 * El watcher de `cuota.json` (`startCuotaFileWatch`/`stopCuotaFileWatch`),
 * contra un archivo de prueba — nunca contra `~/.cache/aos/cuota.json`.
 *
 * `CUOTA_FILE` se calcula una sola vez, al importar el módulo, a partir de
 * `RUTA_CUOTA_JSON`. Para que la env var pisada abajo tenga efecto hace
 * falta un import DINÁMICO del módulo, y que sea el primero: un import
 * estático (`import ... from`) se resuelve antes que cualquier otra línea
 * del archivo por el hoisting de ES modules, así que si este archivo
 * importara el servicio de forma estática en algún lado, ese import ya
 * habría fijado `CUOTA_FILE` a la ruta real antes de que la env var se
 * pisara — y el import dinámico posterior reusaría ese mismo módulo
 * cacheado (es lo que pasaba antes de separar este test a su propio
 * archivo: el import estático de `leerCuotaFile` en
 * `usage-window-cuota-file.service.test.ts` ganaba la carrera).
 *
 * Mismo motivo por el que todo el caso vive en UN solo `test()`: un segundo
 * import dinámico, aunque pise `RUTA_CUOTA_JSON` de nuevo, reusaría el
 * módulo ya cacheado por el primero — con el directorio del primer test
 * todavía adentro, ya borrado — así que un "segundo escenario" en un
 * `test()` separado terminaría probando contra un directorio que no existe,
 * no el nuevo.
 */
test('startCuotaFileWatch nota un cuota.json reescrito por rename, coalesce con debounce, y stopCuotaFileWatch corta el aviso', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cuota-watch-'));
  const archivo = path.join(dir, 'cuota.json');
  const previousRuta = process.env.RUTA_CUOTA_JSON;
  process.env.RUTA_CUOTA_JSON = archivo;

  try {
    const { startCuotaFileWatch, stopCuotaFileWatch } = await import('../services/usage-window-cuota-file.service.js');

    let llamadas = 0;
    startCuotaFileWatch(() => {
      llamadas += 1;
    });

    try {
      // Mismo patrón que `writeCuotaFile`: escribe a un temp y reemplaza por
      // rename, no un write directo — así se prueba lo que de verdad pasa con
      // `cuota.json` (el watcher mira el directorio justamente por esto: un
      // `fs.watch` sobre el archivo deja de disparar después de un rename).
      const tmp1 = `${archivo}.tmp1`;
      await writeFile(tmp1, JSON.stringify({ ts: Math.floor(Date.now() / 1000), five_hour: 10, seven_day: 5 }));
      await rename(tmp1, archivo);

      await esperar(2_000, () => llamadas > 0);
      assert.ok(llamadas > 0, 'onChange no se llamó tras el rename');

      const llamadasTrasPrimerCambio = llamadas;
      // Dos renames pegados: el debounce de 300 ms tiene que coalescerlos,
      // no sumar una llamada por cada evento de fs.watch.
      const tmp2 = `${archivo}.tmp2`;
      await writeFile(tmp2, JSON.stringify({ ts: Math.floor(Date.now() / 1000), five_hour: 20, seven_day: 15 }));
      await rename(tmp2, archivo);

      await esperar(2_000, () => llamadas > llamadasTrasPrimerCambio);
      assert.ok(llamadas > llamadasTrasPrimerCambio, 'onChange no se llamó tras el segundo rename');

      const llamadasTrasSegundoCambio = llamadas;
      await esperar(500, () => false); // deja pasar la ventana del debounce sin más escrituras
      assert.equal(llamadas, llamadasTrasSegundoCambio, 'el debounce no coalesció: sumó llamadas de más');

      // stop: a partir de acá, ni un rename nuevo ni el poll de respaldo
      // tienen que seguir llamando a onChange.
      stopCuotaFileWatch();
      const llamadasAlParar = llamadas;

      const tmp3 = `${archivo}.tmp3`;
      await writeFile(tmp3, JSON.stringify({ ts: Math.floor(Date.now() / 1000), five_hour: 30, seven_day: 25 }));
      await rename(tmp3, archivo);
      await esperar(500, () => false);

      assert.equal(llamadas, llamadasAlParar, 'un watcher parado no debería seguir llamando a onChange');
    } finally {
      stopCuotaFileWatch();
    }
  } finally {
    if (previousRuta === undefined) delete process.env.RUTA_CUOTA_JSON;
    else process.env.RUTA_CUOTA_JSON = previousRuta;
    await rm(dir, { recursive: true, force: true });
  }
});

function esperar(topeMs: number, condicion: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (condicion() || Date.now() - t0 >= topeMs) {
        resolve();
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}
