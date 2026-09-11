import express from 'express';

import { getUsageWindow } from './services/usage-window.service.js';

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

export default router;
