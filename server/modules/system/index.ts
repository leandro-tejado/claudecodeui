// createSystemModule: used by the server entrypoint to mount protected system update routes.
export { createSystemModule } from './system.module.js';

// gobernadorService: the quota semaphore that gates expensive-model session creation.
export { gobernadorService } from './services/gobernador.service.js';
export type { GobernadorColor, GobernadorEstado } from './services/gobernador.service.js';

// ramCeilingService: the RAM ceiling that gates any new session creation.
export { ramCeilingService, RAM_CEILING_PERCENT, medirRamDesdeTexto } from './services/ram-ceiling.service.js';
export type { MedicionRam } from './services/ram-ceiling.service.js';

// recursosService: RAM, disco, sesiones de tmux vivas y el techo, para el header (Fase 3).
export { recursosService } from './services/recursos.service.js';
export type { RecursosSnapshot, MedicionDisco } from './services/recursos.service.js';

// startRecursosBroadcast/stopRecursosBroadcast: called from the server entrypoint's
// startup/shutdown lifecycle, mirroring the usage-window broadcast.
export { startRecursosBroadcast, stopRecursosBroadcast } from './services/recursos-broadcast.service.js';
