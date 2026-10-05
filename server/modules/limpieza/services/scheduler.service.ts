import { correrLimpieza } from './limpieza.service.js';

const INTERVALO_MS = 60 * 60 * 1000;
const PRIMERA_CORRIDA_MS = 5 * 60 * 1000;

let intervalo: NodeJS.Timeout | null = null;
let primera: NodeJS.Timeout | null = null;

function disparar(): void {
  void correrLimpieza().catch((error) => {
    console.error('limpieza: la corrida falló', { error });
  });
}

/**
 * Una corrida 5 min después del arranque (deja que el watcher y el registro se
 * asienten) y después una por hora: así nada queda más de 73 h a la vista.
 * Los timers no retienen el proceso.
 */
export function iniciarLimpieza(): void {
  if (intervalo) return;
  intervalo = setInterval(disparar, INTERVALO_MS);
  intervalo.unref();
  primera = setTimeout(disparar, PRIMERA_CORRIDA_MS);
  primera.unref();
}

export function detenerLimpieza(): void {
  if (intervalo) clearInterval(intervalo);
  if (primera) clearTimeout(primera);
  intervalo = null;
  primera = null;
}
