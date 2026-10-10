import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ListaServicios, type Servicio } from '@/modules/servicios';

const s = (puerto: number, nombre: string, exposicion: Servicio['exposicion'], entrada: string | null = null): Servicio => ({
  puerto, nombre, proceso: null, exposicion, entrada, abrirEn: entrada ? Number(entrada.slice(1)) : null,
});

describe('vista Servicios', () => {
  it('agrupa por exposición en el orden Público, Tailnet, Solo local', () => {
    render(<ListaServicios servicios={[s(9000, 'sin nombre', 'local'), s(3001, 'cloudcli', 'tailnet', ':8446'), s(22, 'sshd', 'publico')]} />);
    const grupos = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(grupos).toEqual(['Público', 'Tailnet', 'Solo local']);
    const tailnet = screen.getByTestId('servicios-tailnet');
    expect(within(tailnet).getByText('cloudcli')).toBeTruthy();
    expect(within(tailnet).getByText(':8446')).toBeTruthy();
    expect(within(tailnet).getByText(':3001')).toBeTruthy();
  });

  it('un puerto sin servicio conocido se marca «sin nombre» y un grupo vacío no se dibuja', () => {
    render(<ListaServicios servicios={[s(9000, 'sin nombre', 'local')]} />);
    expect(screen.getByText('sin nombre')).toBeTruthy();
    expect(screen.queryByTestId('servicios-publico')).toBeNull();
  });

  it('lo que tiene entrada en el tailnet abre por ella; lo solo local no es un enlace', () => {
    render(<ListaServicios servicios={[s(3001, 'CloudCLI', 'tailnet', ':8446'), s(3101, 'Estudio', 'local')]} />);

    const enlaces = screen.getAllByTestId('servicio-enlace');
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0].getAttribute('href')).toBe(`https://${window.location.hostname}:8446/`);
    expect(enlaces[0].textContent).toContain('CloudCLI');
  });
});
