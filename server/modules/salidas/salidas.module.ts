import fs, { promises as fsPromises } from 'node:fs';

import { projectsDb } from '@/modules/database/index.js';
import { createSalidasRouter } from '@/modules/salidas/salidas.routes.js';
import { createSalidasService } from '@/modules/salidas/salidas.service.js';
import type {
  SalidasFileSystem,
  SalidasLogger,
  SalidasProjectGateway,
} from '@/shared/types.js';

/**
 * Production filesystem adapter owned by the Salidas composition root.
 * Mirrors File Tree's module.ts: the service never imports Node's fs APIs
 * itself, so its tests stay path-keyed fakes.
 */
const salidasFileSystem: SalidasFileSystem = {
  readDirectory: (directoryPath) => fsPromises.readdir(directoryPath),
  stat: (filePath) => fsPromises.stat(filePath),
  createReadStream: (filePath) => fs.createReadStream(filePath),
};

/**
 * Database boundary used only by Salidas production composition. Same
 * narrow project-path lookup File Tree consumes through its own gateway.
 */
const salidasProjects: SalidasProjectGateway = {
  getProjectPathById: (projectId) => projectsDb.getProjectPathById(projectId),
};

const salidasLogger: SalidasLogger = {
  error: (message, error) => console.error(message, error),
};

const salidasService = createSalidasService({
  fileSystem: salidasFileSystem,
  projects: salidasProjects,
  logger: salidasLogger,
});

/**
 * Salidas router used by the server entrypoint to mount the authenticated
 * `.informes/` listing and serving API at `/api/projects`.
 */
export const salidasRoutes = createSalidasRouter(salidasService, salidasLogger);
