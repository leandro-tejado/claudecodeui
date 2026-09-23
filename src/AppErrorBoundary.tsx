import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * The last thing between a thrown error and a blank screen.
 *
 * The app had no error boundary at all, which was survivable while every module
 * was in the initial bundle: if the bundle arrived, the code was there. Now that
 * the terminal, the editor and the rest are fetched on demand, any one of those
 * requests can fail on a bad link, and an uncaught rejection from `React.lazy`
 * unmounts the entire tree. That is exactly what a white screen is, and it tells
 * whoever is looking at it nothing.
 *
 * So this shows the error instead, and offers the one repair that fixes the
 * common cause: drop the caches and the service worker, then reload, which
 * forces every chunk to be fetched again from the server.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept on the console for a desktop browser, where there is one to read.
    console.error('[App] Uncaught error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem 1.5rem',
          font: '15px/1.5 system-ui, sans-serif',
          color: '#111',
          background: '#fff',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>La aplicación no pudo cargar</h1>
        <p style={{ margin: 0, color: '#555' }}>
          Suele ser una parte del programa que no terminó de descargarse. Recargar limpiando la
          caché normalmente alcanza.
        </p>
        <pre
          style={{
            margin: 0,
            padding: '0.75rem',
            background: '#f4f4f5',
            borderRadius: '8px',
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {error.name}: {error.message}
        </pre>
        <button
          type="button"
          onClick={hardReload}
          style={{
            padding: '0.75rem 1rem',
            border: 0,
            borderRadius: '8px',
            background: '#2563eb',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 600,
          }}
        >
          Recargar limpiando la caché
        </button>
      </div>
    );
  }
}

async function hardReload() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  } catch {
    // Nothing to clear, or storage is blocked. The reload is still worth doing.
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  } catch {
    // Same: an unavailable service worker is not a reason to skip the reload.
  }
  window.location.reload();
}
