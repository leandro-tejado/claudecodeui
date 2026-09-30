import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

/*
 * Menú de clic derecho del sidebar.
 *
 * Reemplaza a los íconos que vivían en cada fila (estrella, lápiz, tacho): en
 * 272px no entraban junto al ícono de tmux y la edad, y aparecían encima de
 * ellos al pasar el mouse. Acá las acciones existen sin ocupar la fila.
 *
 * Va por portal a `body` porque en mobile el sidebar es un cajón con
 * `transform`, y un `position: fixed` adentro de un ancestro transformado se
 * posiciona contra ese ancestro y no contra la ventana.
 */

export type SkinContextMenuItem = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
};

type SkinContextMenuProps = {
  x: number;
  y: number;
  label: string;
  items: SkinContextMenuItem[];
  onClose: () => void;
};

/** Margen contra el borde de la ventana cuando el menú no entra donde se hizo el clic. */
const EDGE = 8;

export default function SkinContextMenu({ x, y, label, items, onClose }: SkinContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Se mide antes de pintar: sin esto, un clic cerca del borde de abajo dibuja
  // el menú cortado un frame y después salta.
  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    });
  }, [x, y]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    const closeOnOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // Un menú que queda flotando mientras la lista se desplaza apunta a otra fila.
    const closeOnScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnKey);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="fixed z-[100] min-w-[190px] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: position.left, top: position.top, fontSize: 'var(--skin-text-sm)' }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent ${
            item.destructive ? 'text-destructive' : ''
          }`}
        >
          <item.icon className="h-3.5 w-3.5 flex-none opacity-70" />
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
