import { Info } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/shared/utils';

type Props = {
  /** Qué dice el detalle; el ⓘ lo esconde para que la pantalla lleve la menor cantidad de texto. */
  children: ReactNode;
  etiqueta: string;
  className?: string;
};

/**
 * El ⓘ del rediseño: el detalle detrás de un ícono en vez de una oración al
 * lado (REGLA 13). Se abre con un clic o un toque, se cierra con Escape o
 * tocando afuera. No usa el `Tooltip` compartido porque ese espera hover y en
 * el celular —de donde se usa CloudCLI— no hay hover.
 */
export default function InfoCuenta({ children, etiqueta, className }: Props) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbierto(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(event.target as Node)) setAbierto(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [abierto]);

  return (
    <span ref={raiz} className={cn('relative inline-flex flex-none', className)}>
      <button
        type="button"
        aria-label={etiqueta}
        aria-expanded={abierto}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setAbierto((valor) => !valor);
        }}
        className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {abierto && (
        <span
          role="note"
          className="absolute right-0 top-full z-[100] mt-1 block w-60 max-w-[80vw] rounded-lg border border-border bg-popover p-2 text-xs font-normal leading-snug text-popover-foreground shadow-xl"
        >
          {children}
        </span>
      )}
    </span>
  );
}
