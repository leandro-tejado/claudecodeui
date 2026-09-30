import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/shared/utils';

/*
 * 30-sep, Leandro: la animación de las carpetas "no me termina de cerrar".
 * Estas son las del folder-tree que mandó, sin el árbol: la barra lateral
 * (proyectos → sesiones) y el explorador de archivos ya tienen su propio
 * estado de abierto/cerrado y sus propias filas, así que lo que se comparte
 * es el movimiento, no el componente.
 */
const treeMotionVariants = {
  rootInitial: { opacity: 0, y: 20 },
  rootAnimate: { opacity: 1, y: 0 },
  itemInitial: { opacity: 0, x: -10 },
  itemAnimate: { opacity: 1, x: 0 },
  contentHidden: { opacity: 0, height: 0 },
  contentVisible: { opacity: 1, height: 'auto' },
  chevronClosed: { rotate: 0 },
  chevronOpen: { rotate: 90 },
};

const INSTANT = { duration: 0 } as const;

const useTransitions = () => {
  const reduced = useReducedMotion() === true;
  return {
    root: reduced ? INSTANT : { duration: 0.4 },
    item: (level: number) => (reduced ? INSTANT : { duration: 0.2, delay: level * 0.05 }),
    content: reduced ? INSTANT : { duration: 0.3, ease: 'easeInOut' as const },
    chevron: reduced ? INSTANT : { duration: 0.2 },
  };
};

/** Entrada del árbol entero: sube 20px y aparece. */
export function TreeRoot({ className, children }: { className?: string; children: ReactNode }) {
  const transitions = useTransitions();
  return (
    <motion.div
      className={className}
      variants={treeMotionVariants}
      initial="rootInitial"
      animate="rootAnimate"
      transition={transitions.root}
    >
      {children}
    </motion.div>
  );
}

/** Cada fila entra desde la izquierda; más hondo, un poco más tarde. */
export function TreeItem({ level, className, children }: { level: number; className?: string; children: ReactNode }) {
  const transitions = useTransitions();
  return (
    <motion.div
      className={className}
      variants={treeMotionVariants}
      initial="itemInitial"
      animate="itemAnimate"
      transition={transitions.item(level)}
    >
      {children}
    </motion.div>
  );
}

/**
 * El contenido de una carpeta abierta: crece hasta su alto y se desvanece al
 * cerrar. `initial={false}`: lo que ya estaba abierto al montar no se anima,
 * solo lo que abre o cierra el usuario.
 */
export function TreeCollapse({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  const transitions = useTransitions();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={cn('overflow-hidden', className)}
          variants={treeMotionVariants}
          initial="contentHidden"
          animate="contentVisible"
          exit="contentHidden"
          transition={transitions.content}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Un solo chevron que gira 90° en vez de cambiar de ícono. */
export function TreeChevron({ open, className }: { open: boolean; className?: string }) {
  const transitions = useTransitions();
  return (
    <motion.span
      className="flex flex-none items-center"
      data-state={open ? 'open' : 'closed'}
      variants={treeMotionVariants}
      initial={false}
      animate={open ? 'chevronOpen' : 'chevronClosed'}
      transition={transitions.chevron}
      aria-hidden="true"
    >
      <ChevronRight className={className} />
    </motion.span>
  );
}
