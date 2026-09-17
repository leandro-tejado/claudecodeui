import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SkinRecursos from '@/modules/skin/SkinRecursos';
import type { RecursosSnapshot } from '@/modules/skin/useRecursos';

/*
 * Los chips de RAM y disco en la cabecera (Fase 3 del plan
 * `16-septiembre-os-orquestador-y-recursos.md`). El hook se mockea entero:
 * lo que se prueba acá es "con este snapshot, qué pinta", no el transporte
 * de datos (eso ya lo cubre el service de backend con valores forzados).
 */

const { useRecursosMock } = vi.hoisted(() => ({ useRecursosMock: vi.fn() }));
vi.mock('@/modules/skin/useRecursos', () => ({ useRecursos: useRecursosMock }));

const snapshot = (overrides: Partial<RecursosSnapshot> = {}): RecursosSnapshot => ({
  kind: 'recursos',
  ram: { porcentajePct: 51, usadaGb: 4, totalGb: 7.9 },
  disco: { usadoPct: 19, usadoGb: 15, totalGb: 79 },
  sesionesTmux: 18,
  techoRam: 90,
  ...overrides,
});

describe('SkinRecursos', () => {
  it('91% de RAM pinta rojo', () => {
    useRecursosMock.mockReturnValue(snapshot({ ram: { porcentajePct: 91, usadaGb: 7.2, totalGb: 7.9 } }));
    render(<SkinRecursos />);

    const chips = screen.getAllByText('91%');
    expect(chips.some((chip) => chip.className.includes('text-red-500'))).toBe(true);
  });

  it('sin dato de RAM (meminfo no disponible) no inventa un 0%', () => {
    useRecursosMock.mockReturnValue(snapshot({ ram: { porcentajePct: null, usadaGb: null, totalGb: null } }));
    render(<SkinRecursos />);

    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('el popover muestra los GB crudos, las sesiones y el techo del gobernador', () => {
    useRecursosMock.mockReturnValue(snapshot());
    render(<SkinRecursos />);

    fireEvent.click(screen.getByTitle('Recursos del servidor: RAM y disco'));

    expect(screen.getByText('4,0 de 7,9 GB')).toBeTruthy();
    expect(screen.getByText('15,0 de 79,0 GB')).toBeTruthy();
    expect(screen.getByText('18 sesiones · techo 90%')).toBeTruthy();
  });

  it('sin snapshot todavía (primer render, antes del fetch) no rompe', () => {
    useRecursosMock.mockReturnValue(null);
    render(<SkinRecursos />);

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('debajo de 640px muestra un solo chip; a partir de 640px, los dos', () => {
    useRecursosMock.mockReturnValue(snapshot());
    const { container } = render(<SkinRecursos />);

    // No hay media query real en jsdom: lo que se prueba es que la marca de
    // Tailwind para el colapso responsive (`sm:hidden` / `hidden … sm:flex`)
    // está en el nodo correcto, que es lo que decide qué se ve a cada ancho.
    const grupos = container.querySelectorAll('button > span');
    const combinado = Array.from(grupos).find((el) => el.className.includes('sm:hidden'));
    const discretos = Array.from(grupos).filter(
      (el) => el.className.includes('hidden') && el.className.includes('sm:flex'),
    );

    expect(combinado).toBeTruthy();
    expect(discretos).toHaveLength(2);
  });
});
