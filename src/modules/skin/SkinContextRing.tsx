import { memo } from 'react';

import { useContextMeter } from '@/modules/skin/contextMeterStore';
import { CircleProgress } from '@/modules/usage-window';
import { Tooltip } from '@/shared/ui';

/*
 * Cuánto queda del contexto de la sesión, como anillo en la cabecera.
 *
 * Antes vivía en la barra del composer, como barrita con un porcentaje al lado.
 * Se mudó acá por dos razones. La de forma: al lado del anillo de la ventana de
 * 5 horas los dos se leen de un vistazo, y son la misma clase de dato —cuánto
 * queda de algo que se agota—, así que comparten dibujo. La de fondo: el número
 * saltaba de 34% a 100% entre un turno y el siguiente, y un indicador que
 * miente es peor que ninguno. Eso se arregló del lado del servidor; esto es la
 * mitad visible.
 *
 * Sin ventana confirmada no se dibuja nada. El anillo gris no es un 0%: es el
 * hueco que deja un dato que todavía no llegó, igual que hace el de 5 horas
 * antes de su primer snapshot.
 */

const formatTokens = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
};

/** Anillo apagado: ocupa el mismo lugar para que la cabecera no salte. */
const EmptyRing = () => (
  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center" aria-hidden="true">
    <CircleProgress value={0} maxValue={1} size={22} strokeWidth={2.5} disableAnimation getColor={() => 'stroke-transparent'} />
  </div>
);

function SkinContextRing() {
  const meter = useContextMeter();

  if (!meter || !meter.total || meter.used === 0) {
    return <EmptyRing />;
  }

  const { used, total, onShowDetails } = meter;
  const percent = Math.min(100, Math.round((used / total) * 100));
  const label = `Contexto de la sesión: ${percent}% usado, ${formatTokens(used)} de ${formatTokens(total)} tokens`;

  return (
    <Tooltip content={label} position="bottom">
      <button
        type="button"
        onClick={onShowDetails ?? undefined}
        aria-label={`${label}. Ver el desglose.`}
        className="flex flex-shrink-0 items-center gap-1 rounded-full outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span className="flex h-6 w-6 items-center justify-center">
          <CircleProgress value={used} maxValue={total} size={22} strokeWidth={2.5} />
        </span>
        {/* El número se esconde en pantallas chicas: ahí compite con el título
            de la sesión y el anillo ya dice lo suficiente. */}
        <span
          className="hidden tabular-nums text-muted-foreground sm:inline"
          style={{ fontSize: 'var(--skin-text-xs)' }}
        >
          {percent}%
        </span>
      </button>
    </Tooltip>
  );
}

export default memo(SkinContextRing);
