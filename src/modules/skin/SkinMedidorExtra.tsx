import { memo } from 'react';

import { useContextMeter } from '@/modules/skin/contextMeterStore';
import { useRecursos } from '@/modules/skin/useRecursos';
import { FilaMedidor, TituloMedidor } from '@/modules/usage-window';

/*
 * Las secciones del medidor que no son de cuota (escena 9 del boceto 09-oct):
 * el contexto de la sesión y los recursos del servidor. Las arma el skin porque
 * los datos son suyos (`contextMeterStore`, `useRecursos`); el medidor de
 * `usage-window` solo les da lugar.
 */

const formatTokens = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
};

const gb = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const textoGb = (usado: number | null, total: number | null) =>
  usado === null ? '—' : `${gb.format(usado)}${total === null ? '' : `/${gb.format(total)}`} GB`;

function SkinMedidorExtra() {
  const meter = useContextMeter();
  const recursos = useRecursos();

  const contexto = meter && meter.total && meter.used > 0
    ? Math.min(100, Math.round((meter.used / meter.total) * 100))
    : null;
  const compacta = meter && meter.compactAt && meter.inputTokens > 0
    ? Math.min(100, Math.round((meter.inputTokens / meter.compactAt) * 100))
    : null;

  return (
    <>
      {(contexto !== null || compacta !== null) && (
        <section>
          <TituloMedidor>Esta sesión</TituloMedidor>
          {contexto !== null && meter && (
            <FilaMedidor
              rotulo="Contexto"
              pct={contexto}
              valor={`${contexto} %`}
              nota={`${formatTokens(meter.used)} de ${formatTokens(meter.total ?? 0)}`}
            />
          )}
          {compacta !== null && meter && (
            <FilaMedidor
              rotulo="Compacta"
              pct={compacta}
              valor={`${compacta} %`}
              nota={`se compacta a los ${formatTokens(meter.compactAt ?? 0)}`}
            />
          )}
        </section>
      )}
      <section>
        <TituloMedidor>Servidor</TituloMedidor>
        <FilaMedidor
          rotulo="RAM"
          pct={recursos?.ram.porcentajePct ?? null}
          valor={textoGb(recursos?.ram.usadaGb ?? null, recursos?.ram.totalGb ?? null)}
          nota={recursos ? `${recursos.sesionesTmux} sesiones · techo ${recursos.techoRam} %` : undefined}
        />
        <FilaMedidor
          rotulo="Disco"
          pct={recursos?.disco.usadoPct ?? null}
          valor={textoGb(recursos?.disco.usadoGb ?? null, recursos?.disco.totalGb ?? null)}
        />
      </section>
    </>
  );
}

export default memo(SkinMedidorExtra);
