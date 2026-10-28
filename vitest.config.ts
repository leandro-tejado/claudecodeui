import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// On the laptop the suite is capped at 2 workers: uncapped it opens one per core and eats the
// RAM shared with the editor and the sessions. In the cloud (CLAUDE_CODE_REMOTE) the VM has
// 16 GB and runs uncapped.
const inCloud = process.env.CLAUDE_CODE_REMOTE === 'true';

// The client test suite runs under jsdom because the hook and component tests
// added alongside the state refactor rely on real effects, DOM events and
// localStorage — none of which run under react-dom/server.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    environment: 'jsdom',
    // Pinned so the suite does not silently change shape with a developer's
    // local .env — this workspace has VITE_IS_PLATFORM=true, CI has no .env at
    // all, and the flag decides whether the app authenticates with a bearer
    // token. The tests that care stub it per case and assert both modes.
    env: {
      VITE_IS_PLATFORM: 'false',
    },
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    restoreMocks: true,
    ...(inCloud ? {} : { poolOptions: { forks: { minForks: 1, maxForks: 2 }, threads: { minThreads: 1, maxThreads: 2 } } }),
  },
});
