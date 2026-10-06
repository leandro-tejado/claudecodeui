import { useEffect, useState } from 'react';

import { cn } from '@/shared/utils';
import { nivelDeCuota, type NivelCuota } from '@/modules/cuentas/cuentas';
import { evaluarVentana, useUsageWindow } from '@/modules/usage-window';

const COLOR_BARRA: Record<NivelCuota, string> = {
  ok: 'bg-foreground/60',
  aviso: 'bg-amber-500',
  tope: 'bg-red-500',
};

const COLOR_TEXTO: Record<NivelCuota, string> = {
  ok: 'text-muted-foreground',
  aviso: 'text-amber-600 dark:text-amber-400',
  tope: 'text-red-600 dark:text-red-400',
};

function Medidor({ etiqueta, porcentaje }: { etiqueta: string; porcentaje: number | null }) {
  const nivel = nivelDeCuota(porcentaje);
  return (
    <span className="flex items-center gap-1" title={porcentaje === null ? `${etiqueta}: sin dato` : `${etiqueta}: ${Math.round(porcentaje)}%`}>
      <span className="text-[10px] text-muted-foreground">{etiqueta}</span>
      <span className="h-1 w-8 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className={cn('block h-full rounded-full', COLOR_BARRA[nivel])}
          style={{ width: `${porcentaje === null ? 0 : Math.max(0, Math.min(100, porcentaje))}%` }}
        />
      </span>
      <span className={cn('w-7 text-right text-[10px] tabular-nums', COLOR_TEXTO[nivel])}>
        {porcentaje === null ? '—' : `${Math.round(porcentaje)}%`}
      </span>
    </span>
  );
}

/**
 * Las dos ventanas de UNA cuenta, en miniatura, para el selector. El header
 * sigue siendo el anillo de siempre; esto existe porque al elegir hay que ver
 * cuánto le queda a cada cuenta, sin abrir otra cosa.
 */
export default function CuotaCuenta({ cuenta }: { cuenta: string }) {
  const snapshot = useUsageWindow(cuenta);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const cinco = evaluarVentana(snapshot?.fiveHour ?? null, now);
  const semanal = evaluarVentana(snapshot?.sevenDay ?? null, now);
  return (
    <span className="mt-1 flex items-center gap-3" data-testid="cuota-cuenta" data-cuenta={cuenta}>
      <Medidor etiqueta="5h" porcentaje={cinco.tipo === 'dato' ? cinco.porcentaje : null} />
      <Medidor etiqueta="7d" porcentaje={semanal.tipo === 'dato' ? semanal.porcentaje : null} />
    </span>
  );
}
