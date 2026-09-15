import { memo } from 'react';

import { trackClass } from '@/modules/skin/compactBarThresholds';
import { useContextMeter } from '@/modules/skin/contextMeterStore';
import { Tooltip } from '@/shared/ui';

/*
 * Cuánto falta para que la sesión se compacte sola, como barra en la cabecera.
 *
 * Es el tercer indicador, y mide algo que los otros dos no. El anillo de
 * contexto divide por la ventana del modelo; el de 5 horas, por la cuota. La
 * autocompactación no depende de ninguna de las dos: el CLI corta a
 * `window − min(maxOutput, 20K) − 13K`, que con la variable puesta en 278.000
 * da 245.000 tokens de **entrada**. En una sesión de 1M eso es el 24%: el
 * anillo de contexto se ve verde mientras la sesión ya se está compactando.
 * Por eso esto es una barra y no un anillo — no es el mismo dato, y que se
 * parezcan invitaría a leerlos como si lo fueran.
 *
 * La vara es `inputTokens`, no `used`. `used` suma la salida y corre más
 * rápido que el corte real, así que dibujar contra él adelantaría el aviso.
 *
 * Sin `compactAt` no se dibuja nada. Igual que el anillo: el hueco es honesto,
 * un 0% inventado no.
 */

const formatTokens = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
};

/** Barra apagada: ocupa el mismo lugar para que la cabecera no salte. */
const EmptyBar = () => <div className="h-1.5 w-16 flex-none" aria-hidden="true" />;

function SkinCompactBar() {
  const meter = useContextMeter();

  if (!meter || !meter.compactAt || meter.inputTokens === 0) {
    return <EmptyBar />;
  }

  const { inputTokens, compactAt } = meter;
  // El porcentaje crudo puede pasarse de 100: la barra se clampea, el tooltip no.
  const rawPercent = Math.round((inputTokens / compactAt) * 100);
  const percent = Math.min(100, rawPercent);
  const overdue = rawPercent > 100;

  const label = overdue
    ? `Compactación atrasada: ${formatTokens(inputTokens)} de entrada contra un corte de ${formatTokens(compactAt)}. Si no se compacta sola, /compact a mano.`
    : `${formatTokens(inputTokens)} de ${formatTokens(compactAt)} antes de compactar`;

  return (
    <Tooltip content={label} position="bottom">
      <div className="flex flex-none items-center gap-1.5">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
          className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={`h-full rounded-full transition-[width] ${overdue ? 'bg-red-500' : trackClass(percent)}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {/* En pantallas chicas compite con el título de la sesión, igual que el
            número del anillo de contexto. La barra sola ya dice lo suficiente. */}
        <span
          className="hidden whitespace-nowrap tabular-nums text-muted-foreground sm:inline"
          style={{ fontSize: 'var(--skin-text-xs)' }}
        >
          {overdue ? 'compactación atrasada' : `${percent}%`}
        </span>
      </div>
    </Tooltip>
  );
}

export default memo(SkinCompactBar);
