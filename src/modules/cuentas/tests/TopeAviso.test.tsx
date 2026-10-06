import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TopeAviso, _reiniciarCuentasStoreParaTests } from '@/modules/cuentas/testing';
import type { UsageWindowSnapshot } from '@/modules/usage-window';

const { useUsageWindowMock, authenticatedFetchMock } = vi.hoisted(() => ({
  useUsageWindowMock: vi.fn(),
  authenticatedFetchMock: vi.fn(),
}));
vi.mock('@/modules/usage-window/useUsageWindow', () => ({ useUsageWindow: useUsageWindowMock }));
vi.mock('@/shared/api', () => ({ authenticatedFetch: authenticatedFetchMock }));

const CUENTAS = [
  { id: 'optimum', plan: 'max', defecto: true, uso: null, disponible: true },
  { id: 'personal', plan: 'max', defecto: false, uso: null, disponible: true },
];

function snapshot(cincoHoras: number, resetsAt: number | null = Date.now() + 3_600_000): UsageWindowSnapshot {
  return {
    kind: 'usage_window',
    fiveHour: { porcentaje: cincoHoras, resetsAt, leidoEn: Date.now() },
    sevenDay: { porcentaje: 31, resetsAt: Date.now() + 5 * 86_400_000, leidoEn: Date.now() },
  };
}

beforeEach(() => {
  _reiniciarCuentasStoreParaTests();
  useUsageWindowMock.mockReset();
  authenticatedFetchMock.mockReset();
  authenticatedFetchMock.mockResolvedValue({ ok: true, json: async () => ({ cuentas: CUENTAS }) });
});

describe('TopeAviso — cuenta en tope, sin cambio automático', () => {
  it('lee la cuota de la cuenta de la sesión, no la de optimum', () => {
    useUsageWindowMock.mockReturnValue(snapshot(10));
    render(<TopeAviso cuenta="personal" />);
    expect(useUsageWindowMock).toHaveBeenCalledWith('personal');
  });

  it('con la cuota holgada no aparece', () => {
    useUsageWindowMock.mockReturnValue(snapshot(40));
    render(<TopeAviso cuenta="personal" />);
    expect(screen.queryByTestId('tope-aviso')).toBeNull();
  });

  it('en tope muestra la cuenta, la hora de reset y el botón de la otra cuenta', async () => {
    useUsageWindowMock.mockReturnValue(snapshot(100));
    render(<TopeAviso cuenta="personal" onAbrirConCuenta={vi.fn()} />);
    const aviso = screen.getByTestId('tope-aviso');
    expect(aviso.textContent).toContain('Personal en tope');
    expect(aviso.textContent).toContain('vuelve a las');
    expect(await screen.findByRole('button', { name: /Nueva con Optimum/ })).toBeTruthy();
  });

  it('el botón abre una sesión nueva con la otra cuenta; nada cambia solo', async () => {
    useUsageWindowMock.mockReturnValue(snapshot(100));
    const onAbrir = vi.fn();
    render(<TopeAviso cuenta="personal" onAbrirConCuenta={onAbrir} />);

    expect(onAbrir).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /Nueva con Optimum/ }));
    expect(onAbrir).toHaveBeenCalledTimes(1);
    expect(onAbrir).toHaveBeenCalledWith('optimum');
  });

  it('desde optimum ofrece la otra disponible (personal)', async () => {
    useUsageWindowMock.mockReturnValue(snapshot(99));
    render(<TopeAviso cuenta="optimum" onAbrirConCuenta={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /Nueva con Personal/ })).toBeTruthy();
  });

  it('una lectura de una ventana ya reseteada no avisa', () => {
    useUsageWindowMock.mockReturnValue(snapshot(100, Date.now() - 1000));
    render(<TopeAviso cuenta="personal" />);
    expect(screen.queryByTestId('tope-aviso')).toBeNull();
  });
});
