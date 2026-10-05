import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/shared/utils';

/*
 * 30-sep, Leandro: la animación de las carpetas "no me termina de cerrar".
 * Estas son las del folder-tree que mandó, sin el árbol: la barra lateral
 * (proyectos → sesiones) y el explorador de archivos ya tienen su propio
 * estado de abierto/cerrado y sus propias filas, así que lo que se comparte
 * es el movimiento, no el componente.
 *
 * Con CSS y no con `motion`: la barra lateral está en el primer render, y
 * `motion` ahí sumaba 128 KB al camino crítico (5-oct, lo frenó el
 * bundle-budget). Los mismos tiempos y distancias; `prefers-reduced-motion`
 * los apaga (`motion-reduce:`).
 */

const CONTENT_MS = 300;

/** Entrada del árbol entero: sube 20px y aparece. */
export function TreeRoot({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('animate-tree-root-in motion-reduce:animate-none', className)}>{children}</div>;
}

/** Cada fila entra desde la izquierda; más hondo, un poco más tarde. */
export function TreeItem({ level, className, children }: { level: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn('animate-tree-item-in motion-reduce:animate-none', className)}
      style={{ animationDelay: `${level * 50}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * El contenido de una carpeta abierta: crece hasta su alto y se desvanece al
 * cerrar, y recién entonces sale del DOM. Lo que ya estaba abierto al montar
 * no se anima, solo lo que abre o cierra el usuario. El alto se anima con
 * `grid-template-rows` de `0fr` a `1fr`, que no necesita medirlo.
 */
export function TreeCollapse({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(open);
  // Al abrir se monta ya; al cerrar se encoge ya y se desmonta al terminar.
  if (open && !mounted) setMounted(true);
  if (!open && entered) setEntered(false);

  useEffect(() => {
    if (open) {
      // Un cuadro después de montar, para que la transición arranque de cero.
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(() => setMounted(false), CONTENT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  const expanded = open && entered;
  if (!mounted) return null;
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none',
        expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <div className={cn('min-h-0 overflow-hidden', className)}>{children}</div>
    </div>
  );
}

/** Un solo chevron que gira 90° en vez de cambiar de ícono. */
export function TreeChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'flex flex-none items-center transition-transform duration-200 motion-reduce:transition-none',
        open && 'rotate-90',
      )}
      data-state={open ? 'open' : 'closed'}
      aria-hidden="true"
    >
      <ChevronRight className={className} />
    </span>
  );
}
