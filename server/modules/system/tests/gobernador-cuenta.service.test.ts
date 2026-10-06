import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

/**
 * El semaforo se decide con la cuota de la cuenta de la sesion, no con la de
 * la otra. `CUOTA_PATH` se calcula al importar el modulo desde `os.homedir()`,
 * asi que `HOME` se apunta a un directorio temporal ANTES del import dinamico:
 * el test nunca lee ni escribe el `~/.cache/aos` real.
 */
test('el gobernador lee cuota/<id>.json de la cuenta pedida y deja a optimum con su cuota.json', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'gobernador-cuenta-'));
  const previoHome = process.env.HOME;
  process.env.HOME = home;

  try {
    const dir = path.join(home, '.cache', 'aos');
    await mkdir(path.join(dir, 'cuota'), { recursive: true });
    const ahora = Math.floor(Date.now() / 1000);
    const resets = ahora + 3 * 3600;
    // personal en el tope (99%), optimum holgado (10%).
    await writeFile(
      path.join(dir, 'cuota', 'personal.json'),
      JSON.stringify({ ts: ahora, cuenta: 'personal', five_hour: 99, five_hour_resets_at: resets }),
    );
    await writeFile(
      path.join(dir, 'cuota.json'),
      JSON.stringify({ ts: ahora, cuenta: 'optimum', five_hour: 10, five_hour_resets_at: resets }),
    );

    const { gobernadorService } = await import('../services/gobernador.service.js');
    const sinPanes = () => [];

    const personal = gobernadorService.evaluar({ cuenta: 'personal', leerPanesTmux: sinPanes, ahoraEpochSeg: ahora });
    assert.equal(personal.color, 'rojo', 'personal al 99% tiene que salir en rojo');

    const optimum = gobernadorService.evaluar({ leerPanesTmux: sinPanes, ahoraEpochSeg: ahora });
    assert.notEqual(optimum.color, 'rojo', 'optimum al 10% no puede heredar el rojo de personal');

    const optimumExplicito = gobernadorService.evaluar({ cuenta: 'optimum', leerPanesTmux: sinPanes, ahoraEpochSeg: ahora });
    assert.equal(optimumExplicito.color, optimum.color);

    // Cuenta sin archivo de cuota: no hay dato, nunca un rojo prestado de otra cuenta.
    const sinDato = gobernadorService.evaluar({ cuenta: 'otra', leerPanesTmux: sinPanes, ahoraEpochSeg: ahora });
    assert.notEqual(sinDato.color, 'rojo');
  } finally {
    if (previoHome === undefined) delete process.env.HOME;
    else process.env.HOME = previoHome;
    await rm(home, { recursive: true, force: true });
  }
});

/**
 * Un aviso nativo de "usage limit" en el pane de una cuenta pone en rojo a ESA
 * cuenta, no a la otra. Con tmux real: dos sesiones propias con prefijo, una
 * marcada `@cuenta personal` y otra sin marca (= optimum).
 */
const execFileAsync = promisify(execFile);

function hayTmux(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('el aviso nativo de tope solo cuenta para la cuenta del pane (tmux real)', { skip: !hayTmux() && 'tmux no esta instalado' }, async () => {
  const personal = `gob-cuenta-test-${randomUUID().slice(0, 8)}`;
  const optimum = `gob-cuenta-test-${randomUUID().slice(0, 8)}`;
  try {
    for (const nombre of [personal, optimum]) {
      await execFileAsync('tmux', ['new-session', '-d', '-s', nombre, 'cat']);
      await execFileAsync('tmux', ['send-keys', '-t', `=${nombre}:`, '-l', 'Claude usage limit reached']);
      await execFileAsync('tmux', ['send-keys', '-t', `=${nombre}:`, 'Enter']);
    }
    await execFileAsync('tmux', ['set-option', '-t', `=${personal}:`, '@cuenta', 'personal']);
    // Deja que `cat` repinte la linea antes de capturar.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const { gobernadorService } = await import('../services/gobernador.service.js');
    const sinCuota = () => ({});
    const deLaPersonal = gobernadorService.evaluar({ cuenta: 'personal', leerCuota: sinCuota });
    const deOptimum = gobernadorService.evaluar({ cuenta: 'optimum', leerCuota: sinCuota });
    assert.equal(deLaPersonal.color, 'rojo');
    assert.equal(deOptimum.color, 'rojo', 'la sesion sin marca es de optimum y tambien lo dispara');
    // Cuenta sin sesiones propias: ni el aviso de personal ni el de optimum le tocan.
    const deOtra = gobernadorService.evaluar({ cuenta: 'otra', leerCuota: sinCuota });
    assert.notEqual(deOtra.color, 'rojo');

    // Cerrar la de personal deja a optimum solo con su aviso, y a personal limpia.
    await execFileAsync('tmux', ['kill-session', '-t', `=${personal}:`]);
    const personalSola = gobernadorService.evaluar({ cuenta: 'personal', leerCuota: sinCuota });
    assert.notEqual(personalSola.color, 'rojo');
  } finally {
    for (const nombre of [personal, optimum]) {
      try {
        await execFileAsync('tmux', ['kill-session', '-t', `=${nombre}:`]);
      } catch {
        // ya cerrada
      }
    }
  }
});
