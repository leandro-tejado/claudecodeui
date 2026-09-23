import express from 'express';
import type { Request, RequestHandler, Response } from 'express';

import type { SalidasLogger, SalidasServices } from '@/shared/types.js';
import { AppError, createApiSuccessResponse } from '@/shared/utils.js';

function readProjectId(request: Request): string {
  const projectId = typeof request.params.projectId === 'string' ? request.params.projectId.trim() : '';
  if (!projectId) {
    throw new AppError('projectId is required', {
      code: 'PROJECT_ID_REQUIRED',
      statusCode: 400,
    });
  }
  return projectId;
}

function readSalidaId(request: Request): string {
  return typeof request.params.id === 'string' ? request.params.id : '';
}

function createRouteHandler(
  operation: (request: Request, response: Response) => void | Promise<void>,
  logger: SalidasLogger,
): RequestHandler {
  return async (request, response) => {
    try {
      await operation(request, response);
    } catch (error) {
      if (error instanceof AppError) {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.error('Salidas API error', error);
      response.status(500).json({ error: message });
    }
  };
}

/**
 * Builds the Salidas HTTP router for the server composition root and route
 * tests. Mounted directly at `/api/projects` (alongside, not instead of, the
 * Projects module router) so the surface matches the plan's literal paths:
 * `GET /api/projects/:projectId/salidas` and `GET
 * /api/projects/:projectId/salidas/:id`.
 */
export function createSalidasRouter(services: SalidasServices, logger: SalidasLogger): express.Router {
  const router = express.Router();

  router.get('/:projectId/salidas', createRouteHandler(async (request, response) => {
    const salidas = await services.listarSalidas(readProjectId(request));
    response.json(createApiSuccessResponse(salidas));
  }, logger));

  router.get('/:projectId/salidas/:id', createRouteHandler(async (request, response) => {
    const salida = await services.obtenerSalida(readProjectId(request), readSalidaId(request));

    response.setHeader('Content-Type', salida.mime);
    response.setHeader('Content-Length', String(salida.bytes));
    // Always set, per the whitelist's shared rule — a browser must never be
    // left to sniff an `.informes/` payload into something it is not.
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (salida.mime === 'image/svg+xml') {
      // An SVG can carry a <script>; this strips it of any origin to run in.
      response.setHeader('Content-Security-Policy', "default-src 'none'");
    }

    salida.stream.pipe(response);
    salida.stream.on('error', (error) => {
      logger.error('Error streaming salida', error);
      if (!response.headersSent) {
        response.status(500).json({ error: 'Error reading output' });
      }
    });
  }, logger));

  return router;
}
