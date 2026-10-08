import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import UsageWindowIndicator from '@/modules/usage-window/UsageWindowIndicator';
import type { UsageWindowSnapshot } from '@/modules/usage-window/types';

/*
 * Fase 3 de `05-octubre-revision-punta-a-punta.md`: "sin dato" es el estado
 * de no tener ninguna lectura — nunca el de una lectura vieja, que ahora se
 * sigue mostrando (con su antigüedad), y nunca el de la ventana semanal, que
 * ahora siempre se muestra junto a la de 5 horas. Se mockea `useUsageWindow`
 * entero, igual que `UsageWindowPopover.test.tsx` mockea `useUsageDetalle`:
 * acá se prueba la pinta con un snapshot dado, no el socket.
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

function label(): string | null {
  return screen.getByRole('button').getAttribute('title');
}

describe('UsageWindowIndicator — nunca "sin dato" habiendo una lectura, y la semanal siempre se muestra', () => {
  it('con las dos ventanas frescas, el label trae el % de las dos', () => {
    useUsageWindowMock.mockReturnValue(snapshot());
    render(<UsageWindowIndicator />);

    expect(label()).toContain('Ventana de 5 horas: 40% real');
    expect(label()).toContain('Semanal: 55% real');
  });

  it('con sevenDay.resetsAt no nulo, lo muestra formateado en el label', () => {
    useUsageWindowMock.mockReturnValue(snapshot());
    render(<UsageWindowIndicator />);

    expect(label()).toContain('Semanal: 55% real, se renueva a las');
  });

  it('con sevenDay presente pero resetsAt null, igual muestra el % (ya no es "basura": es el dato real)', () => {
    useUsageWindowMock.mockReturnValue(
      snapshot({ sevenDay: { porcentaje: 55, resetsAt: null, leidoEn: Date.now() } }),
    );
    render(<UsageWindowIndicator />);

    expect(label()).toContain('Semanal: 55% real');
    expect(label()).not.toContain('Semanal: 55% real,'); // sin resetsAt no hay ", se renueva..." que agregar
  });

  it('con sevenDay: null, la ventana semanal se muestra como "sin dato" (nunca se esconde)', () => {
    useUsageWindowMock.mockReturnValue(snapshot({ sevenDay: null }));
    render(<UsageWindowIndicator />);

    expect(label()).toContain('Semanal: sin dato');
  });

  it('sin snapshot todavía, las dos ventanas son "sin dato"', () => {
    useUsageWindowMock.mockReturnValue(null);
    render(<UsageWindowIndicator />);

    expect(label()).toBe('Ventana de 5 horas: sin dato · Semanal: sin dato');
  });

  it('una lectura vieja (más de 15 min) sigue mostrando el %, no "sin dato"', () => {
    const vieja = Date.now() - 20 * 60_000;
    useUsageWindowMock.mockReturnValue(
      snapshot({ fiveHour: { porcentaje: 63, resetsAt: Date.now() + 3600_000, leidoEn: vieja } }),
    );
    render(<UsageWindowIndicator />);

    expect(label()).toContain('Ventana de 5 horas: 63% hace 20 min');
    expect(label()).not.toContain('Ventana de 5 horas: sin dato');
    // el número también sigue visible en el botón, no solo en el label
    expect(screen.getByText('63%')).toBeTruthy();
    // apagado con el gris del rótulo, no con opacidad: axe la marcaba sin contraste
    expect(screen.getByText('63%').className).toContain('text-ds-muted');
    expect(screen.getByText('63%').className).not.toContain('opacity-');
  });

  it('una ventana que ya pasó su resetsAt muestra "ventana nueva", no el % de la ventana ya cerrada', () => {
    const resetsAt = Date.now() - 60_000; // ya pasó
    useUsageWindowMock.mockReturnValue(
      snapshot({ fiveHour: { porcentaje: 97, resetsAt, leidoEn: Date.now() - 2 * 60_000 } }),
    );
    render(<UsageWindowIndicator />);

    expect(label()).toContain('Ventana de 5 horas: ventana nueva (se renovó a las');
    expect(label()).not.toContain('97%');
    expect(screen.queryByText('97%')).toBeNull();
  });
});

describe('UsageWindowIndicator — barras del header según el boceto (Fase 11, paso 4)', () => {
  it('la ventana semanal muestra su barra y su % directo en el header, sin abrir el popover', () => {
    useUsageWindowMock.mockReturnValue(snapshot());
    render(<UsageWindowIndicator />);

    // 55% es la ventana semanal del fixture: antes solo se veía al abrir el
    // popover (click). El boceto pide las dos ventanas siempre visibles.
    expect(screen.getByText('55%')).toBeTruthy();
  });

  it('sin ninguna lectura, dice "sin leer aún" en vez de un 0% fantasma', () => {
    useUsageWindowMock.mockReturnValue(null);
    render(<UsageWindowIndicator />);

    expect(screen.getAllByText('sin leer aún').length).toBeGreaterThan(0);
    expect(screen.queryByText('0%')).toBeNull();
  });
});

describe('UsageWindowIndicator — una ventana por cuenta (Fase 3 de 06-octubre-vps-multi-cuenta)', () => {
  it('sin cuenta el label queda como siempre, sin prefijo', () => {
    useUsageWindowMock.mockReturnValue(snapshot());
    render(<UsageWindowIndicator />);

    expect(label()).not.toContain('Cuenta');
  });

  it('con cuenta lee la ventana de esa cuenta y la nombra en el label', () => {
    useUsageWindowMock.mockClear();
    useUsageWindowMock.mockReturnValue(snapshot());
    render(<UsageWindowIndicator cuenta="personal" />);

    expect(useUsageWindowMock).toHaveBeenCalledWith('personal');
    expect(label()).toContain('Cuenta Personal · Ventana de 5 horas: 40% real');
  });
});
