import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

/**
 * Una ventana por cuenta. `RUTA_CUOTA_JSON` se fija ANTES del import dinamico
 * (el modulo lo lee al evaluarse) para no tocar el `~/.cache/aos` real, y todo
 * va en UN test porque el modulo queda cacheado con el primer directorio.
 */
test('las lecturas y los archivos de cuota son por cuenta; optimum no se mezcla con personal', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'usage-cuenta-'));
  const previa = process.env.RUTA_CUOTA_JSON;
  process.env.RUTA_CUOTA_JSON = path.join(dir, 'cuota.json');

  try {
    const servicio = await import('../services/usage-window.service.js');
    const archivo = await import('../services/usage-window-cuota-file.service.js');

    const info = (utilization: number, resetsAt: number) => ({
      unifiedWindows: {
        five_hour: { utilization, resetsAt },
        seven_day: { utilization: utilization / 2, resetsAt: resetsAt + 86_400 },
      },
    });
    const resets = Math.floor(Date.now() / 1000) + 3600;

    assert.equal(servicio.buildSnapshot().fiveHour, null, 'arranca vacia');

    // Una lectura de la cuenta personal no toca la ventana de optimum.
    assert.equal(servicio.recordRateLimitReading(info(0.9, resets), 'personal'), true);
    assert.equal(servicio.buildSnapshot('personal').fiveHour?.porcentaje, 90);
    assert.equal(servicio.buildSnapshot().fiveHour, null, 'optimum sigue sin lectura');
    assert.equal(servicio.buildSnapshot('optimum').fiveHour, null);

    // Y al reves: sin cuenta es optimum.
    assert.equal(servicio.recordRateLimitReading(info(0.2, resets)), true);
    assert.equal(servicio.buildSnapshot('optimum').fiveHour?.porcentaje, 20);
    assert.equal(servicio.buildSnapshot('personal').fiveHour?.porcentaje, 90);
    assert.deepEqual(new Set(servicio.cuentasConLecturas()), new Set(['optimum', 'personal']));

    // Cada una se escribe en SU archivo, con el campo `cuenta`.
    await archivo.writeCuotaFile(servicio.buildSnapshot('personal'), 'personal');
    await archivo.writeCuotaFile(servicio.buildSnapshot('optimum'), 'optimum');

    const personal = JSON.parse(await readFile(path.join(dir, 'cuota', 'personal.json'), 'utf8'));
    const optimum = JSON.parse(await readFile(path.join(dir, 'cuota.json'), 'utf8'));
    assert.equal(personal.cuenta, 'personal');
    assert.equal(personal.five_hour, 90);
    assert.equal(personal.five_hour_resets_at, resets);
    assert.equal(optimum.cuenta, 'optimum');
    assert.equal(optimum.five_hour, 20);

    // La lectura va contra el archivo de la cuenta pedida.
    assert.equal(archivo.leerCuotaFile({ cuenta: 'personal' })?.fiveHour?.porcentaje, 90);
    assert.equal(archivo.leerCuotaFile()?.fiveHour?.porcentaje, 20);
    assert.equal(archivo.leerCuotaFile({ cuenta: 'inexistente' }), null);

    // getUsageWindow por cuenta resiembra desde el archivo de ESA cuenta, sin cruzarlas.
    const personalSnap = await servicio.getUsageWindow({ cuenta: 'personal' });
    assert.equal(personalSnap.fiveHour?.porcentaje, 90);
    const optimumSnap = await servicio.getUsageWindow();
    assert.equal(optimumSnap.fiveHour?.porcentaje, 20);
  } finally {
    if (previa === undefined) delete process.env.RUTA_CUOTA_JSON;
    else process.env.RUTA_CUOTA_JSON = previa;
    await rm(dir, { recursive: true, force: true });
  }
});
