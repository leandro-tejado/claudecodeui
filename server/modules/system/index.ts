// createSystemModule: used by the server entrypoint to mount protected system update routes.
export { createSystemModule } from './system.module.js';

// gobernadorService: the quota semaphore that gates expensive-model session creation.
export { gobernadorService } from './services/gobernador.service.js';
export type { GobernadorColor, GobernadorEstado } from './services/gobernador.service.js';

// ramCeilingService: the RAM ceiling that gates any new session creation.
export { ramCeilingService, RAM_CEILING_PERCENT } from './services/ram-ceiling.service.js';
