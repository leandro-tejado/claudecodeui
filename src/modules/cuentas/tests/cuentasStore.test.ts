import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticatedFetchMock } = vi.hoisted(() => ({ authenticatedFetchMock: vi.fn() }));
vi.mock('@/shared/api', () => ({ authenticatedFetch: authenticatedFetchMock }));

import {
  _reiniciarCuentasStoreParaTests,
  cargarCuentas,
  cuentaDeLaSesionNueva,
  elegirCuentaNueva,
  reiniciarCuentaNueva,
  sugerirCuentaParaProyecto,
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

describe('sugerirCuentaParaProyecto (Fase 5: cuenta por dueño)', () => {
  const responder = (cuenta: string) =>
    authenticatedFetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ cuenta }) });

  it('la sesión nueva arranca en la cuenta que `rutas` le da al proyecto', async () => {
    responder('personal');
    await sugerirCuentaParaProyecto('/home/x/cloudcli');
    expect(authenticatedFetchMock).toHaveBeenCalledWith('/api/cuentas/para?ruta=%2Fhome%2Fx%2Fcloudcli');
    expect(cuentaDeLaSesionNueva()).toBe('personal');
  });

  it('al crear la sesión vuelve a la sugerida, no a optimum', async () => {
    responder('personal');
    await sugerirCuentaParaProyecto('/home/x/cloudcli');
    elegirCuentaNueva('optimum');
    reiniciarCuentaNueva();
    expect(cuentaDeLaSesionNueva()).toBe('personal');
  });

  it('una elección a mano gana en el mismo proyecto y se descarta al cambiar de proyecto', async () => {
    responder('personal');
    await sugerirCuentaParaProyecto('/home/x/cloudcli');
    elegirCuentaNueva('optimum');
    responder('personal');
    await sugerirCuentaParaProyecto('/home/x/cloudcli');
    expect(cuentaDeLaSesionNueva()).toBe('optimum');
    responder('optimum');
    await sugerirCuentaParaProyecto('/home/x/workspace');
    expect(cuentaDeLaSesionNueva()).toBe('optimum');
    responder('personal');
    await sugerirCuentaParaProyecto('/home/x/cloudcli');
    expect(cuentaDeLaSesionNueva()).toBe('personal');
  });

  it('sin proyecto o con el pedido caído, optimum', async () => {
    await sugerirCuentaParaProyecto(null);
    expect(authenticatedFetchMock).not.toHaveBeenCalled();
    expect(cuentaDeLaSesionNueva()).toBe('optimum');
    authenticatedFetchMock.mockRejectedValueOnce(new Error('red'));
    await sugerirCuentaParaProyecto('/home/x/cloudcli');
    expect(cuentaDeLaSesionNueva()).toBe('optimum');
  });

  it('una respuesta que llega tarde de otro proyecto no pisa la del actual', async () => {
    let soltar: (v: unknown) => void = () => {};
    authenticatedFetchMock.mockReturnValueOnce(new Promise((resolve) => { soltar = resolve; }));
    const lenta = sugerirCuentaParaProyecto('/home/x/cloudcli');
    responder('optimum');
    await sugerirCuentaParaProyecto('/home/x/workspace');
    soltar({ ok: true, json: async () => ({ cuenta: 'personal' }) });
    await lenta;
    expect(cuentaDeLaSesionNueva()).toBe('optimum');
  });
});
