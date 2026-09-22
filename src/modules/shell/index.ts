// Deliberately the deferred wrapper and not the component itself: every consumer
// of this module renders a terminal on demand, so none of them needs xterm in the
// initial bundle. Reaching past this barrel to `@/modules/shell/Shell` puts it
// back there.
export { LazyShell as Shell, preloadShell } from '@/modules/shell/LazyShell';
