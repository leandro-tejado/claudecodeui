import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Auto-cleanup only self-registers when vitest globals are enabled, and they are
// not. Without this, a hook rendered in one test stays mounted — with its timers
// and effects live — for the rest of the file.
afterEach(cleanup);

// jsdom ships no `matchMedia`, and components that pick a layout from the
// viewport call it during render. Report the desktop breakpoint, which is the
// layout the sidebar row tests assert on.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// En reposo la barra del skin es el riel (rediseño 09-oct). Las pruebas de la
// lista de proyectos y sesiones miran la barra abierta: arrancan con ella
// fijada, y las del riel la pliegan a propósito.
try {
  localStorage.setItem('skin:barra-fijada', '1');
} catch {
  // Sin storage el store arranca en el riel; las pruebas que lo necesiten lo fijan.
}
