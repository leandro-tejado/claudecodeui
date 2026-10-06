import { AlertTriangle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CUENTA_POR_DEFECTO, nombreDeCuenta, ventanaEnTope } from '@/modules/cuentas/cuentas';
import { useCuentas } from '@/modules/cuentas/useCuentas';
import InfoCuenta from '@/modules/cuentas/InfoCuenta';
import { formatResetTime, useUsageWindow } from '@/modules/usage-window';

type Props = {
  /** Cuenta de la sesión activa. */
  cuenta: string;
  /** Abre una sesión nueva con esa cuenta. Es lo único que cambia de cuenta: nunca pasa solo. */
  onAbrirConCuenta?: (cuentaId: string) => void;
};

/**
 * "Cuenta en tope": avisa que la cuenta de ESTA sesión agotó su ventana, cuándo
 * vuelve, y ofrece abrir una sesión NUEVA con la otra cuenta. No cambia sola,
 * ni propone cambiarla en el sitio: es otra cuenta y otro dueño (términos de
 * Anthropic, plans/06-octubre-vps-multi-cuenta.md), así que quien decide es la
 * persona y por la vía explícita de crear una sesión nueva.
 */
export default function TopeAviso({ cuenta, onAbrirConCuenta }: Props) {
  const snapshot = useUsageWindow(cuenta);
  const { cuentas } = useCuentas();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const tope = ventanaEnTope(snapshot, now);
  if (!tope) return null;

  const nombre = nombreDeCuenta(cuenta);
  // La otra cuenta: optimum si estamos en otra; si estamos en optimum, la primera disponible que no sea ella.
  const otras = cuentas.filter((candidata) => candidata.id !== cuenta && candidata.disponible);
  const otra = otras.find((candidata) => candidata.id === CUENTA_POR_DEFECTO) ?? otras[0] ?? null;

  return (
    <div
      role="status"
      data-testid="tope-aviso"
      className="mt-1.5 flex min-w-0 items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300"
      style={{ fontSize: 'var(--skin-text-xs)' }}
    >
      <AlertTriangle className="h-3.5 w-3.5 flex-none" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">
        {nombre} en tope{tope.ventana === '7d' ? ' (semanal)' : ''}
        {tope.resetsAt !== null && <> · vuelve a las {formatResetTime(tope.resetsAt)}</>}
      </span>
      <InfoCuenta etiqueta="Qué pasa con la sesión en tope">
        La sesión espera el reset. No cambia sola a {otra ? nombreDeCuenta(otra.id) : 'la otra cuenta'}: es otra cuenta y
        otro dueño. Si el trabajo es de esa cuenta, abrí una sesión nueva con ella.
      </InfoCuenta>
      {otra && onAbrirConCuenta && (
        <button
          type="button"
          onClick={() => onAbrirConCuenta(otra.id)}
          className="flex h-6 flex-none items-center gap-1 rounded-md border border-border bg-background px-2 font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Nueva con {nombreDeCuenta(otra.id)}
        </button>
      )}
    </div>
  );
}
