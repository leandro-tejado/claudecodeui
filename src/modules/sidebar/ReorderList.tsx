/**
 * Lista reordenable por drag (o teclado: Space agarra, flechas mueven, Space
 * suelta, Escape cancela).
 *
 * El drag sale SOLO del ícono de grip (`dragControls` + `dragListener={false}`),
 * no de la fila entera: las filas de este sidebar ya tienen su propia
 * interacción (click para abrir la sesión, `SessionOptions` con renombrar/
 * fork/borrar) y arrastrar toda la fila pisaría esos controles.
 */

import { useCallback, useId, useRef, useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';

import { cn } from '@/shared/utils';

const CELL = {
  type: 'spring',
  stiffness: 520,
  damping: 34,
  mass: 0.45,
} as const;
const INSTANT = { duration: 0 } as const;

const moveItem = <T,>(list: readonly T[], from: number, to: number): T[] => {
  const next = [...list];
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken);
  return next;
};

export type UseReorderListOptions<T> = {
  items: readonly T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onReorder: (next: T[]) => void;
  onCommit?: (next: T[]) => void;
  disabled?: boolean;
};

export function useReorderList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  onCommit,
  disabled = false,
}: UseReorderListOptions<T>) {
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [spoken, setSpoken] = useState('');

  const emit = useRef(onReorder);
  emit.current = onReorder;
  const settle = useRef(onCommit);
  settle.current = onCommit;
  const live = useRef(items);
  live.current = items;
  const snapshot = useRef<readonly T[] | null>(null);

  const indexOf = useCallback(
    (id: string) => live.current.findIndex((item) => getId(item) === id),
    [getId],
  );

  const grab = useCallback(
    (id: string) => {
      snapshot.current = live.current;
      setGrabbed(id);
      const at = indexOf(id);
      const item = live.current[at];
      setSpoken(`${getLabel(item)} grabbed, position ${at + 1} of ${live.current.length}.`);
    },
    [getLabel, indexOf],
  );

  const drop = useCallback(
    (id: string) => {
      snapshot.current = null;
      setGrabbed(null);
      const at = indexOf(id);
      const item = live.current[at];
      setSpoken(`${getLabel(item)} dropped at position ${at + 1}.`);
      settle.current?.([...live.current]);
    },
    [getLabel, indexOf],
  );

  const cancel = useCallback(() => {
    if (snapshot.current) emit.current([...snapshot.current]);
    snapshot.current = null;
    setGrabbed(null);
    setSpoken('Reorder cancelled, original order restored.');
  }, []);

  const step = useCallback(
    (id: string, delta: -1 | 1) => {
      const from = indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= live.current.length) return;
      const next = moveItem(live.current, from, to);
      emit.current(next);
      const item = next[to];
      setSpoken(`${getLabel(item)}, position ${to + 1} of ${next.length}.`);
      if (snapshot.current === null) settle.current?.(next);
    },
    [getLabel, indexOf],
  );

  const gripKeyDown = useCallback(
    (id: string) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const held = grabbed === id;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (held) drop(id);
        else grab(id);
        return;
      }
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && held) {
        event.preventDefault();
        step(id, event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (event.key === 'Escape' && held) {
        event.preventDefault();
        cancel();
      }
    },
    [disabled, grabbed, grab, drop, step, cancel],
  );

  const onDragStart = useCallback((id: string) => {
    snapshot.current = live.current;
    setDragging(id);
  }, []);

  const onDragEnd = useCallback(
    (id: string) => {
      snapshot.current = null;
      setDragging(null);
      const at = indexOf(id);
      const item = live.current[at];
      setSpoken(`${getLabel(item)} dropped at position ${at + 1}.`);
      settle.current?.([...live.current]);
    },
    [getLabel, indexOf],
  );

  return { grabbed, dragging, spoken, grab, drop, cancel, step, gripKeyDown, onDragStart, onDragEnd };
}

export type ReorderListProps<T> = UseReorderListOptions<T> & {
  children: (item: T) => React.ReactNode;
  label: string;
  className?: string;
  itemClassName?: string;
};

const GRIP = (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
    <circle cx="2.5" cy="2.5" r="1.2" />
    <circle cx="7.5" cy="2.5" r="1.2" />
    <circle cx="2.5" cy="7" r="1.2" />
    <circle cx="7.5" cy="7" r="1.2" />
    <circle cx="2.5" cy="11.5" r="1.2" />
    <circle cx="7.5" cy="11.5" r="1.2" />
  </svg>
);

type FilaProps<T> = {
  item: T;
  id: string;
  label: string;
  disabled: boolean;
  reduced: boolean;
  hintId: string;
  itemClassName: string;
  grabbed: string | null;
  dragging: string | null;
  gripKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onBlurGrip: () => void;
  children: (item: T) => React.ReactNode;
};

/** Componente propio (no una función suelta en `.map`) porque `useDragControls` es un hook. */
function Fila<T>({
  item,
  id,
  label,
  disabled,
  reduced,
  hintId,
  itemClassName,
  grabbed,
  dragging,
  gripKeyDown,
  onDragStart,
  onDragEnd,
  onBlurGrip,
  children,
}: FilaProps<T>) {
  const controls = useDragControls();
  const held = grabbed === id;
  const lifted = held || dragging === id;

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      transition={reduced ? INSTANT : CELL}
      whileDrag={reduced ? undefined : { scale: 1.01 }}
      style={{ touchAction: 'pan-y' }}
      className={cn(
        'relative flex items-center gap-1 rounded-lg outline-none transition-shadow duration-150',
        lifted ? 'z-10 bg-card shadow-lg' : '',
        held && 'ring-1 ring-primary/40',
        itemClassName,
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${label}`}
        aria-pressed={held}
        aria-describedby={hintId}
        disabled={disabled}
        onPointerDown={(e) => !disabled && controls.start(e)}
        onKeyDown={gripKeyDown}
        onBlur={onBlurGrip}
        className={cn(
          'flex shrink-0 touch-none items-center justify-center rounded p-1 outline-none transition-colors',
          'focus-visible:ring-1 focus-visible:ring-primary/50',
          lifted ? 'cursor-grabbing text-muted-foreground' : 'cursor-grab text-muted-foreground/40 hover:text-muted-foreground',
        )}
      >
        {GRIP}
      </button>
      <div className="min-w-0 flex-1">{children(item)}</div>
    </Reorder.Item>
  );
}

/**
 * Rendered by SidebarRecentConversations and SidebarProjectSessions to let the
 * user drag rows into a custom order. Content is the caller's normal
 * interactive row (link, session options) — only the grip button drags.
 */
export function ReorderList<T>({
  children,
  label,
  className = '',
  itemClassName = '',
  ...options
}: ReorderListProps<T>) {
  const { items, getId, getLabel, onReorder, disabled = false } = options;
  const list = useReorderList(options);
  const reduced = useReducedMotion() === true;
  const hintId = useId();

  return (
    <div className={cn('w-full', className)}>
      <Reorder.Group
        axis="y"
        values={items as T[]}
        onReorder={onReorder}
        aria-label={label}
        className="m-0 list-none space-y-0.5 p-0"
      >
        {items.map((item) => {
          const id = getId(item);
          return (
            <Fila
              key={id}
              item={item}
              id={id}
              label={getLabel(item)}
              disabled={disabled}
              reduced={reduced}
              hintId={hintId}
              itemClassName={itemClassName}
              grabbed={list.grabbed}
              dragging={list.dragging}
              gripKeyDown={list.gripKeyDown(id)}
              onDragStart={() => list.onDragStart(id)}
              onDragEnd={() => list.onDragEnd(id)}
              onBlurGrip={() => list.grabbed === id && list.cancel()}
            >
              {children}
            </Fila>
          );
        })}
      </Reorder.Group>
      <span id={hintId} className="sr-only">
        Drag to reorder using the handle. With the keyboard, Space grabs it, the arrow keys move
        it, Space drops it, and Escape puts everything back.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {list.spoken}
      </span>
    </div>
  );
}

export default ReorderList;
