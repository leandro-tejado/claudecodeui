import express from 'express';

import { getUsageWindow } from './services/usage-window.service.js';
import { usageDetalleService } from './services/usage-detalle.service.js';

const router = express.Router();

/** The current five-hour/seven-day readings, exactly as last reported by the SDK. */
router.get('/', async (_request, response, next) => {
  try {
    const snapshot = await getUsageWindow();
    response.json(snapshot);
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
