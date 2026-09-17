import { useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import type { GobernadorEstado, UsageDetalle } from '@/modules/usage-window/types';

type Estado = {
  detalle: UsageDetalle | null;
  gobernador: GobernadorEstado | null;
};

const VACIO: Estado = { detalle: null, gobernador: null };

/**
 * Qué está contribuyendo a la ventana de 5 h, más el ritmo del gobernador.
 *
 * A diferencia de `useUsageWindow`, nada empuja esto por socket: `consumo.py
 * detalle` corre por fuera (a mano hoy, cada 10 min desde la Fase 6) y el
 * gobernador es un cálculo bajo demanda, no un evento. Por eso es un fetch
 * simple, disparado cuando el popover se monta — que es cuando alguien lo
 * pidió, no antes.
 */
export function useUsageDetalle(activo: boolean): Estado {
  const [estado, setEstado] = useState<Estado>(VACIO);

  useEffect(() => {
    if (!activo) return;
    let cancelled = false;

    void (async () => {
      const [detalleRes, gobernadorRes] = await Promise.allSettled([
        authenticatedFetch('/api/usage-window/detalle'),
        authenticatedFetch('/api/system/gobernador'),
      ]);

      const detalle =
        detalleRes.status === 'fulfilled' && detalleRes.value.ok
          ? ((await detalleRes.value.json()) as UsageDetalle)
          : null;
      const gobernador =
        gobernadorRes.status === 'fulfilled' && gobernadorRes.value.ok
          ? ((await gobernadorRes.value.json()) as GobernadorEstado)
          : null;

      if (!cancelled) setEstado({ detalle, gobernador });
    })();

    return () => {
      cancelled = true;
    };
  }, [activo]);

  return estado;
}
