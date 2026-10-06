import express from 'express';

import { CUENTA_DEL_PROCESO, validarCuenta } from '@/modules/cuentas/index.js';

import { getUsageWindow } from './services/usage-window.service.js';
import { usageDetalleService } from './services/usage-detalle.service.js';

const router = express.Router();

/** The current five-hour/seven-day readings, exactly as last reported by the SDK. */
router.get('/', async (request, response, next) => {
  try {
    // `?cuenta=<id>`: la ventana de esa cuenta (id desconocido = 400); sin ella, optimum.
    const pedida = typeof request.query.cuenta === 'string' ? request.query.cuenta : null;
    const cuenta = pedida ? validarCuenta(pedida) : CUENTA_DEL_PROCESO;
    const snapshot = await getUsageWindow({ cuenta });
    response.json({ ...snapshot, cuenta });
  } catch (error) {
    next(error);
  }
});

/** What's contributing to the current 5h window — reads the file `consumo.py detalle` volcó, never the live .jsonl. */
router.get('/detalle', (_request, response, next) => {
  try {
    const detalle = usageDetalleService.leer();
    response.json(detalle);
  } catch (error) {
    next(error);
  }
});

export default router;
