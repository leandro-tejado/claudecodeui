import { describe, expect, it } from 'vitest';

import {
  CUENTA_POR_DEFECTO,
  cuentaDeSesion,
  inicialDeCuenta,
  nivelDeCuota,
  nombreDeCuenta,
  ventanaEnTope,
} from '@/modules/cuentas';

describe('helpers de cuenta', () => {
  it('una sesión sin campo cuenta es de optimum', () => {
    expect(cuentaDeSesion({})).toBe(CUENTA_POR_DEFECTO);
    expect(cuentaDeSesion(null)).toBe(CUENTA_POR_DEFECTO);
    expect(cuentaDeSesion({ cuenta: '' })).toBe(CUENTA_POR_DEFECTO);
    expect(cuentaDeSesion({ cuenta: 42 })).toBe(CUENTA_POR_DEFECTO);
    expect(cuentaDeSesion({ cuenta: 'personal' })).toBe('personal');
  });

  it('la inicial y el nombre salen del id', () => {
    expect(inicialDeCuenta('optimum')).toBe('O');
    expect(inicialDeCuenta('personal')).toBe('P');
    expect(nombreDeCuenta('personal')).toBe('Personal');
  });

  it('los cortes de color son los del boceto: 60 y 85', () => {
    expect(nivelDeCuota(0)).toBe('ok');
    expect(nivelDeCuota(59)).toBe('ok');
    expect(nivelDeCuota(60)).toBe('aviso');
    expect(nivelDeCuota(85)).toBe('aviso');
    expect(nivelDeCuota(86)).toBe('tope');
    expect(nivelDeCuota(null)).toBe('ok');
  });
});

describe('ventanaEnTope', () => {
  const ahora = 1_000_000;
  const lectura = (porcentaje: number, resetsAt: number | null) => ({ porcentaje, resetsAt });

  it('sin snapshot o con cuota holgada no hay tope', () => {
    expect(ventanaEnTope(null, ahora)).toBeNull();
    expect(ventanaEnTope({ fiveHour: lectura(40, ahora + 1000), sevenDay: lectura(20, ahora + 5000) }, ahora)).toBeNull();
  });

  it('la ventana de 5 horas agotada es tope y trae su hora de reset', () => {
    expect(ventanaEnTope({ fiveHour: lectura(100, ahora + 3600), sevenDay: lectura(31, ahora + 9000) }, ahora)).toEqual({
      ventana: '5h',
      resetsAt: ahora + 3600,
    });
  });

  it('una lectura cuyo reset ya pasó no cuenta: es de la ventana anterior', () => {
    expect(ventanaEnTope({ fiveHour: lectura(100, ahora - 1), sevenDay: null }, ahora)).toBeNull();
  });

  it('si las dos están topadas gana la semanal, que tarda más en volver', () => {
    expect(ventanaEnTope({ fiveHour: lectura(100, ahora + 10), sevenDay: lectura(99, ahora + 500) }, ahora)?.ventana).toBe('7d');
  });
});
