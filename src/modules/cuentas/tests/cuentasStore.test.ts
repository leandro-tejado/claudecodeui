import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticatedFetchMock } = vi.hoisted(() => ({ authenticatedFetchMock: vi.fn() }));
vi.mock('@/shared/api', () => ({ authenticatedFetch: authenticatedFetchMock }));

import {
  _reiniciarCuentasStoreParaTests,
  cargarCuentas,
  cuentaDeLaSesionNueva,
  elegirCuentaNueva,
  reiniciarCuentaNueva,
} from '@/modules/cuentas/cuentasStore';

beforeEach(() => {
  _reiniciarCuentasStoreParaTests();
  authenticatedFetchMock.mockReset();
});

afterEach(() => {
  _reiniciarCuentasStoreParaTests();
});

describe('la cuenta de la próxima sesión nueva', () => {
  it('arranca en optimum, se puede cambiar y vuelve a optimum', () => {
    expect(cuentaDeLaSesionNueva()).toBe('optimum');
    elegirCuentaNueva('personal');
    expect(cuentaDeLaSesionNueva()).toBe('personal');
    reiniciarCuentaNueva();
    expect(cuentaDeLaSesionNueva()).toBe('optimum');
  });

  it('un id vacío cae a optimum, no a una cuenta vacía', () => {
    elegirCuentaNueva('personal');
    elegirCuentaNueva('   ');
    expect(cuentaDeLaSesionNueva()).toBe('optimum');
  });
});

describe('cargarCuentas', () => {
  it('pide /api/cuentas una sola vez', async () => {
    authenticatedFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ cuentas: [{ id: 'optimum', plan: 'max', defecto: true, uso: null, disponible: true }] }),
    });
    await cargarCuentas();
    await cargarCuentas();
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
    expect(authenticatedFetchMock).toHaveBeenCalledWith('/api/cuentas');
  });

  it('un fallo de red o un 500 no rompe nada: el selector queda con el defecto', async () => {
    authenticatedFetchMock.mockRejectedValueOnce(new Error('sin red'));
    await expect(cargarCuentas()).resolves.toBeUndefined();
    authenticatedFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await expect(cargarCuentas()).resolves.toBeUndefined();
  });
});
