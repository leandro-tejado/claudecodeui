import { createRequire } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { getConnectableHost, normalizeLoopbackHost } from './shared/networkHosts.js'

// The client shows the installed package version so it can be compared against the
// version the server process is actually running. Reading package.json here and
// injecting it keeps the frontend free of imports that reach outside src/.
const pkg = createRequire(import.meta.url)('./package.json')

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  const configuredHost = env.HOST || '0.0.0.0'
  // if the host is not a loopback address, it should be used directly. 
  // This allows the vite server to EXPOSE all interfaces when the host 
  // is set to '0.0.0.0' or '::', while still using 'localhost' for browser 
  // URLs and proxy targets.
  const host = normalizeLoopbackHost(configuredHost)
  
  const proxyHost = getConnectableHost(configuredHost)
  // TODO: Remove support for legacy PORT variables in all locations in a future major release, leaving only SERVER_PORT.
  const serverPort = env.SERVER_PORT || env.PORT || 3001

  return {
    // The bundle map is a diagnostic, not part of a normal build: it inflates the
    // output and would ship the module graph to production. VISUALIZE=1 opts in.
    plugins: [
      react(),
      ...(process.env.VISUALIZE
        ? [visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })]
        : [])
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      host,
      port: parseInt(env.VITE_PORT) || 5173,
      proxy: {
        '/api': `http://${proxyHost}:${serverPort}`,
        '/ws': {
          target: `ws://${proxyHost}:${serverPort}`,
          ws: true
        },
        '/shell': {
          target: `ws://${proxyHost}:${serverPort}`,
          ws: true
        },
        '/plugin-ws': {
          target: `ws://${proxyHost}:${serverPort}`,
          ws: true
        },
        // Without this, browser notifications only work in the built app: in
        // dev the route never reaches the backend and the socket dies silently.
        '/desktop-notifications': {
          target: `ws://${proxyHost}:${serverPort}`,
          ws: true
        }
      }
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Only React is pinned to a chunk of its own, and only because it is a
          // genuine dependency of the first render: splitting it out lets it be
          // cached across releases instead of riding along in the entry hash.
          //
          // CodeMirror and xterm used to be pinned here too. That split the files
          // without deferring anything — the app imported both statically, so both
          // stayed in the critical path — and worse, Rollup elected the CodeMirror
          // chunk as the shared one, so the entry pulled 644 KB in to reach three
          // symbols, one of them Vite's own preload helper. Now that the editor and
          // the terminal are loaded on demand, Rollup derives those chunks from the
          // dynamic imports and they land off the critical path on their own.
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom']
          }
        }
      }
    }
  }
})
