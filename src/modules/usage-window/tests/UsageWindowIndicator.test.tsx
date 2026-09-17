import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import UsageWindowIndicator from '@/modules/usage-window/UsageWindowIndicator';
import type { UsageWindowSnapshot } from '@/modules/usage-window/types';

/*
 * Fase 2 de `17-septiembre-ux-sesiones-y-cuota.md`: el reset de `sevenDay` se
 * muestra formateado, igual que ya pasaba con `fiveHour`. Se mockea
 * `useUsageWindow` entero, igual que `UsageWindowPopover.test.tsx` mockea
 * `useUsageDetalle`: acá se prueba la pinta con un snapshot dado, no el socket.
 */

const { useUsageWindowMock } = vi.hoisted(() => ({ useUsageWindowMock: vi.fn() }));
vi.mock('@/modules/usage-window/useUsageWindow', () => ({ useUsageWindow: useUsageWindowMock }));

function snapshot(overrides: Partial<UsageWindowSnapshot> = {}): UsageWindowSnapshot {
  return {
    kind: 'usage_window',
    fiveHour: { porcentaje: 40, resetsAt: Date.now() + 3600_000, leidoEn: Date.now() },
    sevenDay: { porcentaje: 55, resetsAt: Date.now() + 86_400_000, leidoEn: Date.now() },
    ...overrides,
  };
}

describe('UsageWindowIndicator — reset de la ventana semanal', () => {
  it('con sevenDay.resetsAt no nulo, lo muestra formateado en el label', () => {
    useUsageWindowMock.mockReturnValue(snapshot());
    render(<UsageWindowIndicator />);

    const button = screen.getByRole('button');
    expect(button.getAttribute('title')).toContain('Semanal: se renueva a las');
    expect(button.getAttribute('aria-label')).toContain('Semanal: se renueva a las');
  });

  it('con sevenDay: null no rompe ni agrega basura al label', () => {
    useUsageWindowMock.mockReturnValue(snapshot({ sevenDay: null }));
    render(<UsageWindowIndicator />);

    const button = screen.getByRole('button');
    expect(button.getAttribute('title')).not.toContain('Semanal');
  });

  it('con sevenDay presente pero resetsAt null, tampoco muestra basura', () => {
    useUsageWindowMock.mockReturnValue(
      snapshot({ sevenDay: { porcentaje: 55, resetsAt: null, leidoEn: Date.now() } }),
    );
    render(<UsageWindowIndicator />);

    const button = screen.getByRole('button');
    expect(button.getAttribute('title')).not.toContain('Semanal');
  });

  it('sin snapshot todavía, no rompe', () => {
    useUsageWindowMock.mockReturnValue(null);
    render(<UsageWindowIndicator />);

    expect(screen.getByRole('button').getAttribute('title')).toBe('Ventana de 5 horas: sin dato');
  });
});
