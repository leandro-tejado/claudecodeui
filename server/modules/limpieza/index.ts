// seleccionarLimpieza: la decisión pura (qué proyectos y sesiones salen de la barra).
export { seleccionarLimpieza, rutaDentroDe, proyectoDeCwd } from './services/seleccion.service.js';
export type { PlanLimpieza, ProyectoLimpieza, SesionLimpieza, TmuxViva, SesionFija } from './services/seleccion.service.js';

// ejecutarLimpieza / correrLimpieza: la parte fina que duerme tmux, archiva y avisa.
export { ejecutarLimpieza } from './services/ejecucion.service.js';
export type { LineaLimpieza, ModoLimpieza } from './services/ejecucion.service.js';
export { correrLimpieza } from './services/limpieza.service.js';

// iniciarLimpieza/detenerLimpieza: llamados desde el arranque y el apagado del server.
export { iniciarLimpieza, detenerLimpieza } from './services/scheduler.service.js';
