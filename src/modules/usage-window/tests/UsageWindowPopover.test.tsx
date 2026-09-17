import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import UsageWindowPopover from '@/modules/usage-window/UsageWindowPopover';
import type { GobernadorEstado, UsageDetalle, UsageWindowSnapshot } from '@/modules/usage-window/types';

/*
 * El bloque "qué está contribuyendo" y el ritmo del gobernador (Fase 4 del
 * plan `16-septiembre-os-orquestador-y-recursos.md`). Se mockea
 * `useUsageDetalle` entero, igual que `skinRecursos.test.tsx` mockea su
 * hook: acá se prueba la pinta con un dato dado, no el fetch.
 */

const { useUsageDetalleMock } = vi.hoisted(() => ({ useUsageDetalleMock: vi.fn() }));
vi.mock('@/modules/usage-window/useUsageDetalle', () => ({ useUsageDetalle: useUsageDetalleMock }));

const snapshot: UsageWindowSnapshot = {
  kind: 'usage_window',
  fiveHour: { porcentaje: 40, resetsAt: null, leidoEn: Date.now() },
  sevenDay: { porcentaje: 55, resetsAt: null, leidoEn: Date.now() },
};

const detalle = (overrides: Partial<UsageDetalle> = {}): UsageDetalle => ({
  ts: Date.now() / 1000,
  ventanaInicio: '2026-09-17T03:40:00+00:00',
  ventanaFin: '2026-09-17T08:40:00+00:00',
  usdTotal: 3.39,
  llamadas: 49,
  topSesiones: [{ sid: 'abc', cwd: '~/workspace-leandro', llamadas: 44, usd: 2.16, pct: 63.87 }],
  pctSubagentes: 12,
  pctCtxAlto: 63.87,
  porSkill: [{ skill: 'aos-core:ejecutar-plan', usd: 2.16, pct: 63.87 }],
  ...overrides,
});

const gobernador = (overrides: Partial<GobernadorEstado> = {}): GobernadorEstado => ({
  color: 'verde',
  pace: 80,
  motivo: 'ritmo normal',
  ...overrides,
});

function renderPopover() {
  return render(
    <UsageWindowPopover
      snapshot={snapshot}
      now={Date.now()}
      onClose={() => {}}
      anchor={null}
      anchorEl={null}
    />,
  );
}

describe('UsageWindowPopover — qué está contribuyendo y gobernador', () => {
  it('muestra la sesión top, subagentes, contexto alto y skills', () => {
    useUsageDetalleMock.mockReturnValue({ detalle: detalle(), gobernador: null });
    renderPopover();

    expect(screen.getByText('workspace-leandro')).toBeTruthy();
    expect(screen.getByText('aos-core:ejecutar-plan')).toBeTruthy();
    expect(screen.getByText(/Subagentes: 12%/)).toBeTruthy();
    expect(screen.getByText(/Contexto >150K: 64%/)).toBeTruthy();
  });

  it('sin dato todavía (consumo.py detalle no corrió) no muestra la sección', () => {
    useUsageDetalleMock.mockReturnValue({ detalle: null, gobernador: null });
    renderPopover();

    expect(screen.queryByText('Qué está contribuyendo')).toBeNull();
  });

  it('gobernador en rojo pinta el semáforo y el motivo', () => {
    useUsageDetalleMock.mockReturnValue({
      detalle: null,
      gobernador: gobernador({ color: 'rojo', pace: 130, motivo: 'pace muy por encima del reset' }),
    });
    renderPopover();

    const chip = screen.getByText(/rojo/);
    expect(chip.className).toContain('text-red-500');
    expect(screen.getByText('pace muy por encima del reset')).toBeTruthy();
  });

  it('sin gobernador todavía no rompe ni inventa un semáforo', () => {
    useUsageDetalleMock.mockReturnValue({ detalle: null, gobernador: null });
    renderPopover();

    expect(screen.queryByText('Ritmo del gobernador')).toBeNull();
  });
});
