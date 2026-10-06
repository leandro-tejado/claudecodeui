import { useEffect } from 'react';

import { cargarCuentas, useCuentasState } from '@/modules/cuentas/cuentasStore';

/**
 * Las cuentas del registro del servidor, pedidas una vez. Mientras no llegan
 * (o si el pedido falla) la lista queda vacía y el selector ofrece solo la
 * cuenta por defecto: el chat no depende de que este endpoint responda.
 */
export function useCuentas() {
  const state = useCuentasState();

  useEffect(() => {
    void cargarCuentas();
  }, []);

  return state;
}
