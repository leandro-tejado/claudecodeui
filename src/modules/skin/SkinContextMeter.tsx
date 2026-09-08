import { memo } from 'react';

import { Tooltip } from '@/shared/ui';

/*
 * Medidor de contexto del composer.
 *
 * Reemplaza al `TokenUsageSummary` de upstream, que mostraba el número crudo
 * ("125K tokens"). El número solo no dice nada: 125K puede ser cómodo o estar al
 * borde según la ventana. Lo que se quiere saber de un vistazo es cuánto queda,
 * y eso es una proporción.
 *
 * Sigue abriendo el desglose detallado al hacer click, así que el número exacto
 * no se pierde: deja de ocupar la barra.
 *
 * NOTA sobre el límite de 5 horas de la suscripción: hoy no hay de dónde
 * sacarlo. CloudCLI sólo conoce el mensaje de error que Claude devuelve cuando
 * el límite YA se agotó (`formatUsageLimitText`), no la cuota restante. Añadir
 * esa segunda barra requiere primero una fuente de ese dato.
 */

type SkinContextMeterProps = {
  usage: Record<string, unknown> | null;
  onClick?: () => void;
};

const readNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const formatTokens = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
};

/** Ventana configurada por env; el default es el mismo que usa el server. */
const configuredWindow = (): number =>
  readNumber(import.meta.env.VITE_CONTEXT_WINDOW) || 160_000;

function SkinContextMeter({ usage, onClick }: SkinContextMeterProps) {
  const breakdown =
    usage?.breakdown && typeof usage.breakdown === 'object'
      ? (usage.breakdown as Record<string, unknown>)
      : null;

  const used =
    readNumber(usage?.used) ||
    readNumber(usage?.inputTokens ?? breakdown?.input) +
      readNumber(usage?.outputTokens ?? breakdown?.output);

  // Sin consumo todavía (sesión nueva) no hay nada que informar.
  if (used === 0) return null;

  const total = readNumber(usage?.contextWindow) || configuredWindow();
  const ratio = Math.min(1, used / total);
  const percent = Math.round(ratio * 100);

  /* Tres tramos: cómodo, atención y al borde. El color hace el trabajo que
     antes pedía leer y comparar dos números. */
  const tone =
    ratio >= 0.9
      ? { bar: 'bg-destructive', text: 'text-destructive' }
      : ratio >= 0.7
        ? { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-500' }
        : { bar: 'bg-emerald-500', text: 'text-muted-foreground' };

  return (
    <Tooltip
      content={`${formatTokens(used)} de ${formatTokens(total)} tokens · ${percent}% del contexto`}
      position="top"
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`Contexto usado: ${percent} por ciento. Ver el desglose.`}
        className="inline-flex h-8 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-accent"
      >
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <span
            className={`block h-full rounded-full transition-all duration-500 ${tone.bar}`}
            style={{ width: `${Math.max(2, percent)}%` }}
          />
        </span>
        <span className={`tabular-nums ${tone.text}`} style={{ fontSize: 'var(--skin-text-xs)' }}>
          {percent}%
        </span>
      </button>
    </Tooltip>
  );
}

/** Memoizado: el composer re-renderiza en cada tecla y esto sólo cambia al cerrar un turno. */
export default memo(SkinContextMeter);
