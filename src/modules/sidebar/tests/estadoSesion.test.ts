import { describe, expect, it } from 'vitest';

import {
  estadoDeSesion,
  COLOR_ESTADO_SESION,
  DESCRIPCION_ESTADO_SESION,
  ROTULO_ESTADO_SESION,
} from '@/modules/sidebar/estadoSesion';

/**
 * Fase 11, paso 4: los cuatro estados de la barra (boceto
 * `05-octubre-header-barra.html`) — pensando, esperando, libre, dormida.
 * `necesitaAtencion` gana sobre todo lo demás; `isProcessing` y el trabajo de
 * fondo comparten "pensando"; sin ninguna señal, "libre" si se tocó hace
 * poco y "dormida" si no.
 */
describe('estadoDeSesion', () => {
  it('con una pregunta o permiso pendiente, esperando — incluso si además está procesando', () => {
    expect(
      estadoDeSesion({
        isProcessing: true,
        tieneTrabajoDeFondo: false,
        necesitaAtencion: true,
        tocadaRecientemente: true,
      }),
    ).toBe('esperando');
  });

  it('con el turno principal en curso, pensando', () => {
    expect(
      estadoDeSesion({
        isProcessing: true,
        tieneTrabajoDeFondo: false,
        necesitaAtencion: false,
        tocadaRecientemente: true,
      }),
    ).toBe('pensando');
  });

  it('con solo trabajo de fondo (subagentes/workflows), también pensando', () => {
    expect(
      estadoDeSesion({
        isProcessing: false,
        tieneTrabajoDeFondo: true,
        necesitaAtencion: false,
        tocadaRecientemente: false,
      }),
    ).toBe('pensando');
  });

  it('sin nada pendiente pero tocada hace poco, libre', () => {
    expect(
      estadoDeSesion({
        isProcessing: false,
        tieneTrabajoDeFondo: false,
        necesitaAtencion: false,
        tocadaRecientemente: true,
      }),
    ).toBe('libre');
  });

  it('sin nada pendiente y sin tocar hace rato, dormida', () => {
    expect(
      estadoDeSesion({
        isProcessing: false,
        tieneTrabajoDeFondo: false,
        necesitaAtencion: false,
        tocadaRecientemente: false,
      }),
    ).toBe('dormida');
  });

  /*
   * Bug del 07-oct: la sesión 4e7d7ee3 ("Multicuenta: prueba del selector de
   * cuenta") figuraba "dormida" con su tmux viva y esperando el próximo
   * mensaje, porque "dormida" se decidía solo por la edad del último cambio.
   * Con un proceso vivo detrás, la sesión está libre aunque haga horas que
   * nadie le escribe; sin él, está dormida aunque se haya tocado hace un rato.
   */
  it('con el proceso de tmux vivo y sin tocar hace rato, libre — no dormida', () => {
    expect(
      estadoDeSesion({
        isProcessing: false,
        tieneTrabajoDeFondo: false,
        necesitaAtencion: false,
        tocadaRecientemente: false,
        procesoVivo: true,
      }),
    ).toBe('libre');
  });

  it('con el pane de tmux muerto, dormida aunque se haya tocado hace poco', () => {
    expect(
      estadoDeSesion({
        isProcessing: false,
        tieneTrabajoDeFondo: false,
        necesitaAtencion: false,
        tocadaRecientemente: true,
        procesoVivo: false,
      }),
    ).toBe('dormida');
  });

  it('sin dato de tmux (sesión del chat por SDK) sigue la regla de los 10 min', () => {
    const base = { isProcessing: false, tieneTrabajoDeFondo: false, necesitaAtencion: false, procesoVivo: null };
    expect(estadoDeSesion({ ...base, tocadaRecientemente: true })).toBe('libre');
    expect(estadoDeSesion({ ...base, tocadaRecientemente: false })).toBe('dormida');
  });

  it('cada estado tiene rótulo, color y una explicación para una persona, nunca solo el color', () => {
    for (const estado of ['pensando', 'esperando', 'libre', 'dormida'] as const) {
      expect(ROTULO_ESTADO_SESION[estado]).toBe(estado);
      expect(COLOR_ESTADO_SESION[estado]).toMatch(/^text-ds-/);
      expect(DESCRIPCION_ESTADO_SESION[estado].startsWith(`${estado}: `)).toBe(true);
    }
    expect(DESCRIPCION_ESTADO_SESION.libre).toMatch(/espera tu (próximo )?mensaje/);
    expect(DESCRIPCION_ESTADO_SESION.dormida).toMatch(/sin proceso vivo/);
  });
});
