import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * En reposo la barra es el riel (rediseño 09-oct): sin preferencia guardada
 * arranca plegada, y la clave vieja que guardaba «abierta» no la saca de ahí.
 * El store lee el storage al cargarse, así que cada caso lo importa de nuevo.
 */
const cargarStore = async () => {
  vi.resetModules();
  return import('@/modules/skin/skinUiStore');
};
const plegada = (store: Awaited<ReturnType<typeof cargarStore>>) =>
  renderHook(() => store.useSkinUi()).result.current.sidebarCollapsed;

describe('skinUiStore en reposo', () => {
  afterEach(() => {
    localStorage.removeItem('skin:sidebar-collapsed');
    localStorage.setItem('skin:barra-fijada', '1');
  });

  it('sin preferencia guardada arranca en el riel', async () => {
    localStorage.removeItem('skin:barra-fijada');
    const store = await cargarStore();
    expect(plegada(store)).toBe(true);
  });

  it('la clave vieja con «abierta» no lo saca del riel', async () => {
    localStorage.removeItem('skin:barra-fijada');
    localStorage.setItem('skin:sidebar-collapsed', '0');
    const store = await cargarStore();
    expect(plegada(store)).toBe(true);
  });

  it('fijarla con el logo se recuerda', async () => {
    localStorage.removeItem('skin:barra-fijada');
    const store = await cargarStore();
    store.toggleSidebarCollapsed();
    expect(localStorage.getItem('skin:barra-fijada')).toBe('1');
    const recargado = await cargarStore();
    expect(plegada(recargado)).toBe(false);
  });
});
