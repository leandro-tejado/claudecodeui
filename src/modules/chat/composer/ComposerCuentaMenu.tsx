import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

import {
  AccountChip,
  CUENTA_POR_DEFECTO,
  CuotaCuenta,
  InfoCuenta,
  elegirCuentaNueva,
  iconoDeCuenta,
  nombreDeCuenta,
  useCuentas,
  type CuentaPublica,
} from '@/modules/cuentas';
import { useComposerMenuAnchor } from '@/modules/chat/hooks/useComposerMenuAnchor';
import {
  ComposerMenuHeading,
  ComposerMenuItem,
  ComposerMenuSurface,
} from '@/modules/chat/composer/ComposerMenuPrimitives';

type Props = {
  /**
   * `true` mientras la sesión todavía no existe: la cuenta se elige ahora y
   * queda fija. Con la sesión creada el control es solo una etiqueta, porque la
   * cuenta no cambia después (otra cuenta es otro dueño y otra cuota).
   */
  puedeElegir: boolean;
  /** Cuenta de la sesión ya creada, o la elegida para la nueva. */
  cuenta: string;
};

/**
 * La cuenta de IA del próximo turno, junto al modelo en el composer.
 *
 * Con sesión nueva abre un menú con las cuentas del registro y la cuota de cada
 * una (5h y 7d), optimum marcada por defecto. Con sesión existente solo muestra
 * la etiqueta, sin menú. La elección vive en `cuentasStore`; quien crea la
 * sesión la lee de ahí y el servidor la fija en la fila.
 */
export default function ComposerCuentaMenu({ puedeElegir, cuenta }: Props) {
  const { cuentas } = useCuentas();
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close);

  if (!puedeElegir) {
    return <AccountChip cuenta={cuenta} size="md" />;
  }

  // Sin la lista del servidor todavía, igual se ofrece la cuenta por defecto.
  const opciones: CuentaPublica[] = cuentas.length > 0
    ? cuentas
    : [{ id: CUENTA_POR_DEFECTO, plan: null, defecto: true, uso: null, disponible: true }];
  const ariaLabel = `Cuenta de IA: ${nombreDeCuenta(cuenta)}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setIsOpen((current) => !current);
        }}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <AccountChip cuenta={cuenta} size="md" className="bg-transparent px-0" />
        <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
      </button>

      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel="Cuenta de IA">
          <ComposerMenuHeading>
            <span className="inline-flex items-center gap-1">
              Cuenta
              <InfoCuenta etiqueta="Cómo funciona la cuenta">
                Optimum: trabajo del cliente. Personal: proyectos propios y servidor. Se fija al crear la sesión y no
                cambia después. Nunca pasa sola a la otra.
              </InfoCuenta>
            </span>
          </ComposerMenuHeading>
          {opciones.map((opcion) => {
            return (
              <ComposerMenuItem
                key={opcion.id}
                icon={iconoDeCuenta(opcion.id, 'h-4 w-4')}
                label={nombreDeCuenta(opcion.id)}
                description={
                  opcion.disponible ? (
                    <>
                      {opcion.plan ? `${opcion.plan}${opcion.defecto ? ' · por defecto' : ''}` : opcion.defecto ? 'por defecto' : null}
                      <CuotaCuenta cuenta={opcion.id} />
                    </>
                  ) : (
                    'Sin credencial en el VPS'
                  )
                }
                isSelected={opcion.id === cuenta}
                className={opcion.disponible ? undefined : 'cursor-not-allowed opacity-50'}
                onSelect={() => {
                  if (!opcion.disponible) return;
                  elegirCuentaNueva(opcion.id);
                  setIsOpen(false);
                }}
              />
            );
          })}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}
