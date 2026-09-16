import express from 'express';

import type { createSystemUpdateService } from './system.service.js';
import type { gobernadorService } from './services/gobernador.service.js';

/** Creates thin system routes that delegate update execution to the service. */
export function createSystemRouter(
  systemUpdateService: ReturnType<typeof createSystemUpdateService>,
  gobernador: typeof gobernadorService,
): express.Router {
  const router = express.Router();

  router.post('/update', async (_request, response, next) => {
    try {
      const result = await systemUpdateService.updateSystem();
      response.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/gobernador', (_request, response, next) => {
    try {
      response.json(gobernador.evaluar());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
