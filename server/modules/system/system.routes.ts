import express from 'express';

import { validarCuenta } from '@/modules/cuentas/index.js';

import type { createSystemUpdateService } from './system.service.js';
import type { gobernadorService } from './services/gobernador.service.js';
import type { recursosService } from './services/recursos.service.js';
import { serviciosService } from './services/servicios.service.js';

/** Creates thin system routes that delegate update execution to the service. */
export function createSystemRouter(
  systemUpdateService: ReturnType<typeof createSystemUpdateService>,
  gobernador: typeof gobernadorService,
  recursos: typeof recursosService,
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
      // `?cuenta=<id>`: el semáforo de esa cuenta; sin ella, el de optimum.
      const pedida = typeof _request.query.cuenta === 'string' ? _request.query.cuenta : null;
      response.json(gobernador.evaluar({ cuenta: pedida ? validarCuenta(pedida) : null }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/recursos', (_request, response, next) => {
    try {
      response.json(recursos.medir());
    } catch (error) {
      next(error);
    }
  });

  // Solo lectura: puertos que escuchan y cómo se entra a cada uno. Va detrás
  // de `authenticateToken` como el resto de `/api/system`.
  router.get('/servicios', (_request, response, next) => {
    try {
      response.json(serviciosService.listar());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
