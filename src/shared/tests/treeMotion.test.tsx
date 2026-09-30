import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TreeChevron, TreeCollapse, TreeItem } from '@/shared/ui';

/*
 * 30-sep, Leandro: las carpetas se abren y cierran con la animación del
 * folder-tree que mandó. Lo que tiene que seguir siendo cierto con la
 * animación puesta: el contenido cerrado se va del DOM (no queda escondido
 * ocupando lugar), y el chevron dice si está abierto.
 */

function Carpeta({ inicial }: { inicial: boolean }) {
  const [open, setOpen] = useState(inicial);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}>
        <TreeChevron open={open} className="h-3 w-3" />
        carpeta
      </button>
      <TreeCollapse open={open}>
        <TreeItem level={1}>
          <span>archivo.ts</span>
        </TreeItem>
      </TreeCollapse>
    </div>
  );
}

const chevronState = (container: HTMLElement) =>
  container.querySelector('[data-state]')?.getAttribute('data-state');

describe('TreeMotion: el abrir y cerrar de las carpetas', () => {
  it('abre con el contenido a la vista y al cerrar lo saca del DOM cuando termina la salida', async () => {
    const { container } = render(<Carpeta inicial={false} />);
    expect(screen.queryByText('archivo.ts')).toBeNull();
    expect(chevronState(container)).toBe('closed');

    fireEvent.click(screen.getByRole('button', { name: 'carpeta' }));
    expect(screen.getByText('archivo.ts')).toBeTruthy();
    expect(chevronState(container)).toBe('open');

    fireEvent.click(screen.getByRole('button', { name: 'carpeta' }));
    expect(chevronState(container)).toBe('closed');
    await waitFor(() => expect(screen.queryByText('archivo.ts')).toBeNull());
  });

  it('lo que ya estaba abierto al montar se ve de entrada, sin arrancar en alto cero', () => {
    render(<Carpeta inicial />);
    const contenido = screen.getByText('archivo.ts').closest('.overflow-hidden') as HTMLElement;
    expect(contenido).toBeTruthy();
    expect(contenido.style.height).not.toBe('0px');
  });
});
