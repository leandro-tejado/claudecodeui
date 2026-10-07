import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { i18n, loadLanguage } from '@/modules/i18n';
import Cuestionario from '@/modules/chat/Cuestionario';
import {
  publishTmuxPromptError,
  publishTmuxPrompts,
  resetTmuxPromptStoreForTests,
  type TmuxPrompt,
  useTmuxPrompts,
} from '@/modules/skin';

/*
 * `Cuestionario` (Fase 11 paso 3) reemplaza a `TmuxPromptBanner`: misma
 * tarjeta por pane, mismo `data-testid="tmux-prompt"`, pero un solo
 * adaptador `onResponder(prompt, seleccion)` en vez de `onAnswer`/`onKey`
 * separados. Lo que cambia de fondo (Fase 9 paso 2, CLAVE de este paso):
 * para una pregunta de casillas (`multiple`) tildar ya NO manda nada — la
 * selección se acumula en el estado local de la tarjeta y recién "Enviar"/
 * "Siguiente" la manda entera con `{ tipo: 'seleccion', indices }`, que es
 * lo que el servidor traduce a una sola orden compuesta
 * (`responderSeleccionCompuestaTmux`) en vez de carrerear un pedido por
 * clic contra `TMUX_PROMPT_STALE` — eso era lo que trababa
 * `pregunta/tmux-multi` en la pantalla "Review and submit" de la TUI.
 */

const PROMPT: TmuxPrompt = {
  id: 'huella-1',
  sessionId: 'ses-frenada',
  pane: 'optimumads-guia-1',
  pregunta: 'Do you want to proceed?',
  detalle: 'Bash command\n\ngit push -q\n\nAsk rule Bash(git push *) overrides auto mode for this command.',
  opciones: [
    { indice: 0, numero: 1, etiqueta: 'Yes' },
    { indice: 1, numero: 2, etiqueta: 'No' },
  ],
  seleccionada: 0,
  desde: '2026-09-30T04:40:00.000Z',
};

afterEach(() => {
  resetTmuxPromptStoreForTests();
});

function renderCuestionario(onResponder = vi.fn()) {
  const Harness = () => {
    const { prompts, errors } = useTmuxPrompts();
    return <Cuestionario prompts={prompts} errors={errors} onResponder={onResponder} />;
  };
  render(<Harness />);
  return onResponder;
}

describe('Cuestionario (tmux): la pregunta pendiente con sus botones', () => {
  it('muestra la pregunta, el comando y un botón por opción; el click manda esa opción', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onResponder = renderCuestionario();
    act(() => { publishTmuxPrompts([PROMPT]); });

    expect(screen.getByText('Do you want to proceed?')).toBeTruthy();
    expect(screen.getByText(/Ask rule Bash\(git push \*\)/)).toBeTruthy();
    expect(screen.getByText(/pane optimumads-guia-1/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2. No' }));
    expect(onResponder).toHaveBeenCalledWith(PROMPT, { tipo: 'opcion', indice: 1 });
    // Mientras el pane no la saca, no se puede mandar otra vez: las dos
    // opciones quedan deshabilitadas y dicen "Enviando…".
    const enviando = screen.getAllByRole('button', { name: 'Enviando…' });
    expect(enviando).toHaveLength(2);
    expect(enviando[0]).toHaveProperty('disabled', true);

    // El servidor la rechaza: vuelve a estar disponible y dice por qué.
    act(() => { publishTmuxPromptError(PROMPT.pane, PROMPT.id, 'La pregunta cambió. No se mandó nada.'); });
    expect(screen.getByRole('status').textContent).toBe('La pregunta cambió. No se mandó nada.');
    expect(screen.getByRole('button', { name: '1. Yes' })).toHaveProperty('disabled', false);

    // El pane la sacó de pantalla: la tarjeta se va.
    act(() => { publishTmuxPrompts([]); });
    expect(screen.queryByTestId('tmux-prompt')).toBeNull();
  });

  it('AskUserQuestion de una sola pregunta: las opciones son botones y "Type something." es un campo que manda lo escrito', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onResponder = renderCuestionario();
    const ask: TmuxPrompt = {
      ...PROMPT,
      id: 'huella-ask',
      pregunta: 'Which color do you prefer?',
      detalle: '☐ Color',
      opciones: [
        { indice: 0, numero: 1, etiqueta: 'Rojo (Recommended)\nRed color option' },
        { indice: 1, numero: 2, etiqueta: 'Azul\nBlue color option' },
        { indice: 2, numero: 3, etiqueta: 'Type something.', libre: true },
        { indice: 3, numero: 4, etiqueta: 'Chat about this' },
      ],
    };
    act(() => { publishTmuxPrompts([ask]); });

    expect(screen.getByRole('button', { name: '1. Rojo (Recommended)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Type something/ })).toBeNull();
    const send = screen.getByRole('button', { name: 'Responder' });
    expect(send).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Escribí tu respuesta'), { target: { value: '  Verde  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    expect(onResponder).toHaveBeenCalledWith(ask, { tipo: 'opcion', indice: 2, texto: 'Verde' });
    // Sin "aria-label" propio, el texto de cada botón (incluido el de enviar
    // del campo libre) pasa a decir "Enviando…" mientras se espera al pane.
    const enviando = screen.getAllByRole('button', { name: 'Enviando…' });
    expect(enviando.length).toBeGreaterThan(0);
    enviando.forEach((boton) => expect(boton).toHaveProperty('disabled', true));
  });

  it('un formulario sin opciones se ve tal cual, con un botón por tecla de su pie; cada tecla se manda sola', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onResponder = renderCuestionario();
    const form: TmuxPrompt = {
      ...PROMPT,
      id: 'huella-form',
      pregunta: 'Teach auto mode about your environment?',
      detalle: 'How you use Claude here     Mixed\n❯ Also scan shell history     false\n\nContinue',
      opciones: [],
      seleccionada: -1,
      teclas: [
        { tecla: 'Up', accion: '' },
        { tecla: 'Down', accion: '' },
        { tecla: 'Left', accion: 'change' },
        { tecla: 'Right', accion: 'change' },
        { tecla: 'Enter', accion: 'continue' },
        { tecla: 'Escape', accion: 'cancel' },
      ],
    };
    act(() => { publishTmuxPrompts([form]); });

    // Con los espacios tal cual: alinean los valores del formulario.
    const pre = screen.getByText((_, element) => element?.tagName === 'PRE');
    expect(pre.textContent).toContain('❯ Also scan shell history     false');
    expect(screen.getByRole('button', { name: 'Enter · continue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esc · cancel' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bajar' }));
    expect(onResponder).toHaveBeenCalledWith(form, { tipo: 'tecla', tecla: 'Down' });
    // Estos botones tienen su "aria-label" fijo (no cambia con "Enviando…"):
    // lo que avisa que no se puede mandar de nuevo es que quedan deshabilitados.
    expect(screen.getByRole('button', { name: 'Subir' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Bajar' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Esc · cancel' })).toHaveProperty('disabled', true);
  });
});

describe('Cuestionario (tmux): AskUserQuestion de selección múltiple con varias preguntas', () => {
  /*
   * 5-oct, cloudcli-limpieza-guia-1: los botones numerados solo tildaban y
   * destildaban, no había "Siguiente" ni "Enviar", y "Ninguno más" apretado
   * cuatro veces prendía y apagaba la casilla sin que la pregunta avanzara.
   */
  const MULTI: TmuxPrompt = {
    ...PROMPT,
    id: 'huella-multi',
    pregunta: 'Días?',
    detalle: '',
    opciones: [
      { indice: 0, numero: 1, etiqueta: 'Lunes\nPrimer día', casilla: true, marcada: true },
      { indice: 1, numero: 2, etiqueta: 'Martes\nSegundo día', casilla: true, marcada: false },
      { indice: 2, numero: 3, etiqueta: 'Type something', casilla: true, marcada: false, libre: true },
      { indice: 3, numero: null, etiqueta: 'Next', avance: true },
      { indice: 4, numero: 4, etiqueta: 'Chat about this' },
    ],
    seleccionada: 0,
    multiple: true,
    pestanas: [
      { etiqueta: 'Frutas', estado: 'respondida', activa: false },
      { etiqueta: 'Dias', estado: 'pendiente', activa: true },
      { etiqueta: 'Colores', estado: 'pendiente', activa: false },
      { etiqueta: 'Submit', estado: 'enviar', activa: false },
    ],
    teclas: [
      { tecla: 'Left', accion: 'previous' },
      { tecla: 'Right', accion: 'next' },
      { tecla: 'Escape', accion: 'cancel' },
    ],
  };

  it('pestañas con la activa, casillas con lo que dice el pane, y "Type something" es casilla + campo', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    renderCuestionario();
    act(() => { publishTmuxPrompts([MULTI]); });

    const tabs = screen.getByTestId('tmux-prompt-tabs');
    expect(tabs.querySelector('[aria-current="step"]')?.textContent).toBe('Dias');
    expect(screen.getByText(/^Selección múltiple$/)).toBeTruthy();

    expect(screen.getByRole('checkbox', { name: '1. Lunes' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: '2. Martes' }).getAttribute('aria-checked')).toBe('false');
    // "Next" no es una fila de la pregunta: solo vive en el botón del pie, como "Siguiente".
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Siguiente/ })).toBeTruthy();

    // "Type something" es una casilla (sin número) con un campo que aparece recién al tildarla.
    const libre = screen.getByRole('checkbox', { name: 'Type something' });
    expect(libre.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByLabelText('Escribí tu respuesta')).toBeNull();
    fireEvent.click(libre);
    expect(libre.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('Escribí tu respuesta')).toBeTruthy();

    // ←/→ no se repiten en la fila de teclas; Esc sí queda.
    expect(screen.queryByRole('button', { name: 'Izquierda' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Esc · cancel' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '← Anterior' }));
  });

  it('CLAVE: tildar es local y no manda nada; "Siguiente" manda todo junto una sola vez y a los 4 s se reactiva', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    vi.useFakeTimers();
    try {
      const onResponder = renderCuestionario();
      act(() => { publishTmuxPrompts([MULTI]); });

      // Tildar Martes: solo cambia el estado local, no se manda nada.
      fireEvent.click(screen.getByRole('checkbox', { name: '2. Martes' }));
      expect(onResponder).not.toHaveBeenCalled();
      expect(screen.getByRole('checkbox', { name: '2. Martes' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('checkbox', { name: '1. Lunes' })).toHaveProperty('disabled', false);

      // Un segundo click la destilda, también local.
      fireEvent.click(screen.getByRole('checkbox', { name: '2. Martes' }));
      expect(onResponder).not.toHaveBeenCalled();
      expect(screen.getByRole('checkbox', { name: '2. Martes' }).getAttribute('aria-checked')).toBe('false');

      // La vuelve a tildar y confirma: UNA sola orden compuesta con todo lo tildado.
      fireEvent.click(screen.getByRole('checkbox', { name: '2. Martes' }));
      fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }));
      expect(onResponder).toHaveBeenCalledTimes(1);
      expect(onResponder).toHaveBeenCalledWith(MULTI, { tipo: 'seleccion', indices: [0, 1] });

      // Mientras el pane no la saca, las casillas quedan bloqueadas…
      expect(screen.getByRole('checkbox', { name: '1. Lunes' })).toHaveProperty('disabled', true);
      // …y a los 4 s, si el pane no cambió de pantalla, se reactivan.
      act(() => { vi.advanceTimersByTime(4100); });
      expect(screen.getByRole('checkbox', { name: '1. Lunes' })).toHaveProperty('disabled', false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('con la etiqueta "Submit" el botón de avance dice "Enviar"; sin fila "Next" pero con tecla Right de revisión dice "Revisar y enviar"', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onResponder = renderCuestionario();
    const ultima: TmuxPrompt = {
      ...MULTI,
      opciones: MULTI.opciones.map((opcion) => (opcion.avance ? { ...opcion, etiqueta: 'Submit' } : opcion)),
    };
    act(() => { publishTmuxPrompts([ultima]); });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onResponder).toHaveBeenCalledWith(ultima, { tipo: 'seleccion', indices: [0] });

    const unica: TmuxPrompt = {
      ...PROMPT,
      id: 'huella-unica',
      opciones: [
        { indice: 0, numero: 1, etiqueta: 'Rojo' },
        { indice: 1, numero: 2, etiqueta: 'Azul' },
      ],
      multiple: false,
      pestanas: [
        { etiqueta: 'Color', estado: 'respondida', activa: true },
        { etiqueta: 'Submit', estado: 'enviar', activa: false },
      ],
      teclas: [{ tecla: 'Right', accion: 'review' }],
    };
    act(() => { publishTmuxPrompts([unica]); });
    expect(screen.getByText(/Una sola respuesta/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
    expect(onResponder).toHaveBeenCalledWith(unica, { tipo: 'tecla', tecla: 'Right' });
  });

  it('teclado: un número tilda sin mandar nada, Enter manda la selección compuesta y Esc manda la tecla', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onResponder = renderCuestionario();
    act(() => { publishTmuxPrompts([MULTI]); });

    const tarjeta = screen.getByTestId('tmux-prompt');
    fireEvent.keyDown(tarjeta, { key: '2' });
    expect(onResponder).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: '2. Martes' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(tarjeta, { key: 'Enter' });
    expect(onResponder).toHaveBeenCalledTimes(1);
    expect(onResponder).toHaveBeenCalledWith(MULTI, { tipo: 'seleccion', indices: [0, 1] });
  });

  it('teclado: Esc manda la tecla de escape ofrecida por el pie, sin pasar por el envío compuesto', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onResponder = renderCuestionario();
    act(() => { publishTmuxPrompts([MULTI]); });

    const tarjeta = screen.getByTestId('tmux-prompt');
    fireEvent.keyDown(tarjeta, { key: 'Escape' });
    expect(onResponder).toHaveBeenCalledWith(MULTI, { tipo: 'tecla', tecla: 'Escape' });
  });
});
