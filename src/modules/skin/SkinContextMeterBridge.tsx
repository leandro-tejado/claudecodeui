import { memo, useEffect } from 'react';

import { publishContextMeter } from '@/modules/skin/contextMeterStore';

/*
 * Puente entre el budget del chat y el anillo de la cabecera.
 *
 * No pinta nada, y es a propósito: ocupa el lugar donde upstream monta su
 * `TokenUsageSummary` dentro del composer —una línea de import ya desviada, así
 * que no agrega deuda de merge— pero lo único que hace es publicar el dato al
 * store. El indicador vive arriba, al lado del de la ventana de 5 horas, que es
 * donde se mira sin estar escribiendo.
 */

type SkinContextMeterBridgeProps = {
  usage: Record<string, unknown> | null;
  onClick?: () => void;
};

function SkinContextMeterBridge({ usage, onClick }: SkinContextMeterBridgeProps) {
  useEffect(() => {
    publishContextMeter(usage, onClick ?? null);
  }, [usage, onClick]);

  // Al desmontarse el chat, la cabecera no puede seguir mostrando el contexto
  // de una sesión que ya no está en pantalla.
  useEffect(() => () => publishContextMeter(null, null), []);

  return null;
}

export default memo(SkinContextMeterBridge);
