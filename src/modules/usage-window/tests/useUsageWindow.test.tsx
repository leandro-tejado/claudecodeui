import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUsageWindow } from '@/modules/usage-window/useUsageWindow';
import type { UsageWindowSnapshot } from '@/modules/usage-window/types';

/*
 * Una ventana por cuenta: el hook escucha solo los frames de la cuenta pedida
 * (uno sin `cuenta` es de un servidor viejo y vale optimum) y pide por HTTP la
 * suya. Se mockean el socket y el fetch: acá se prueba el filtrado, no la red.
 */

const { authenticatedFetchMock, subscribeMock, estado } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  subscribeMock: vi.fn(),
  estado: { listener: null as null | ((event: unknown) => void) },
}));
vi.mock('@/shared/api', () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock('@/shared/context/WebSocketContext', () => ({ useWebSocket: () => ({ subscribe: subscribeMock }) }));

const frame = (cuenta: string | undefined, porcentaje: number): UsageWindowSnapshot & { cuenta?: string } => ({
  kind: 'usage_window',
  ...(cuenta ? { cuenta } : {}),
  fiveHour: { porcentaje, resetsAt: null, leidoEn: 1 },
  sevenDay: null,
});

beforeEach(() => {
  authenticatedFetchMock.mockReset();
  authenticatedFetchMock.mockResolvedValue({ ok: false });
  subscribeMock.mockReset();
  subscribeMock.mockImplementation((listener: (event: unknown) => void) => {
    estado.listener = listener;
    return () => {};
  });
});

describe('useUsageWindow por cuenta', () => {
  it('optimum pide /api/usage-window sin query', async () => {
    renderHook(() => useUsageWindow());
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalled());
    expect(authenticatedFetchMock).toHaveBeenCalledWith('/api/usage-window');
  });

  it('otra cuenta pide su propia ventana con ?cuenta=', async () => {
    renderHook(() => useUsageWindow('personal'));
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalled());
    expect(authenticatedFetchMock).toHaveBeenCalledWith('/api/usage-window?cuenta=personal');
  });

  it('ignora los frames de otra cuenta y toma los suyos', () => {
    const { result } = renderHook(() => useUsageWindow('personal'));

    act(() => estado.listener?.(frame('optimum', 90)));
    expect(result.current).toBeNull();

    act(() => estado.listener?.(frame('personal', 12)));
    expect(result.current?.fiveHour?.porcentaje).toBe(12);
  });

  it('un frame sin cuenta es de optimum: no lo toma personal, sí el defecto', () => {
    const personal = renderHook(() => useUsageWindow('personal'));
    act(() => estado.listener?.(frame(undefined, 70)));
    expect(personal.result.current).toBeNull();

    const optimum = renderHook(() => useUsageWindow());
    act(() => estado.listener?.(frame(undefined, 70)));
    expect(optimum.result.current?.fiveHour?.porcentaje).toBe(70);
  });

  it('al cambiar de cuenta no hereda la lectura de la anterior', () => {
    const { result, rerender } = renderHook(({ c }) => useUsageWindow(c), { initialProps: { c: 'optimum' } });
    act(() => estado.listener?.(frame('optimum', 55)));
    expect(result.current?.fiveHour?.porcentaje).toBe(55);

    rerender({ c: 'personal' });
    expect(result.current).toBeNull();
  });
});
