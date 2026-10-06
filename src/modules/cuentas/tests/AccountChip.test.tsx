import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AccountChip } from '@/modules/cuentas';

describe('AccountChip', () => {
  it('optimum: inicial O, maletín y nombre completo en el title', () => {
    const { container } = render(<AccountChip cuenta="optimum" />);
    const chip = screen.getByTestId('account-chip');
    expect(chip.textContent).toBe('O');
    expect(chip.getAttribute('data-cuenta')).toBe('optimum');
    expect(chip.getAttribute('title')).toBe('Cuenta Optimum');
    expect(container.querySelector('svg.lucide-briefcase')).not.toBeNull();
  });

  it('personal: inicial P y ícono de persona', () => {
    const { container } = render(<AccountChip cuenta="personal" size="md" />);
    const chip = screen.getByTestId('account-chip');
    expect(chip.textContent).toBe('P');
    expect(chip.getAttribute('title')).toBe('Cuenta Personal');
    expect(container.querySelector('svg.lucide-user')).not.toBeNull();
  });

  it('es gris: nunca lleva un color de estado', () => {
    render(<AccountChip cuenta="personal" />);
    const clases = screen.getByTestId('account-chip').className;
    expect(clases).toContain('bg-muted');
    expect(clases).not.toMatch(/red|amber|emerald|green/);
  });
});
