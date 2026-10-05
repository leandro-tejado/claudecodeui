import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { i18n, loadLanguage } from '@/modules/i18n';
import TmuxPromptBanner from '@/modules/chat/composer/TmuxPromptBanner';
import {
  publishTmuxPromptError,
  publishTmuxPrompts,
  resetTmuxPromptStoreForTests,
  type TmuxPrompt,
  useTmuxPrompts,
} from '@/modules/skin';

/*
 * 30-sep: una sesión de tmux frenada en "Do you want to proceed?" no se veía
 * en el chat. La pregunta aparece con un botón por opción, y el botón manda
 * esa opción al pane.
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

describe('chat: la pregunta pendiente con sus botones', () => {
  it('muestra la pregunta, el comando y un botón por opción; el botón manda esa opción', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onAnswer = vi.fn();
    const Harness = () => {
      const { prompts, errors } = useTmuxPrompts();
      return <TmuxPromptBanner prompts={prompts} errors={errors} onAnswer={onAnswer} />;
    };
    render(<Harness />);
    act(() => { publishTmuxPrompts([PROMPT]); });

    expect(screen.getByText('Do you want to proceed?')).toBeTruthy();
    expect(screen.getByText(/Ask rule Bash\(git push \*\)/)).toBeTruthy();
    expect(screen.getByText(/pane optimumads-guia-1/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2. No' }));
    expect(onAnswer).toHaveBeenCalledWith(PROMPT, 1);
    // Mientras el pane no la saca, no se puede mandar otra vez.
    expect(screen.getByRole('button', { name: 'Enviando…' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '1. Yes' })).toHaveProperty('disabled', true);

    // El servidor la rechaza: vuelve a estar disponible y dice por qué.
    act(() => { publishTmuxPromptError(PROMPT.pane, PROMPT.id, 'La pregunta cambió. No se mandó nada.'); });
    expect(screen.getByRole('status').textContent).toBe('La pregunta cambió. No se mandó nada.');
    expect(screen.getByRole('button', { name: '1. Yes' })).toHaveProperty('disabled', false);

    // El pane la sacó de pantalla: la tarjeta se va.
    act(() => { publishTmuxPrompts([]); });
    expect(screen.queryByTestId('tmux-prompt')).toBeNull();
  });

  it('AskUserQuestion: las opciones son botones y "Type something." es un campo que manda lo escrito', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onAnswer = vi.fn();
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
    const Harness = () => {
      const { prompts, errors } = useTmuxPrompts();
      return <TmuxPromptBanner prompts={prompts} errors={errors} onAnswer={onAnswer} />;
    };
    render(<Harness />);
    act(() => { publishTmuxPrompts([ask]); });

    expect(screen.getByRole('button', { name: '1. Rojo (Recommended)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Type something/ })).toBeNull();
    const send = screen.getByRole('button', { name: 'Responder' });
    expect(send).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Escribí tu respuesta'), { target: { value: '  Verde  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    expect(onAnswer).toHaveBeenCalledWith(ask, 2, 'Verde');
    expect(screen.getByRole('button', { name: 'Enviando…' })).toHaveProperty('disabled', true);
  });

  it('5-oct: un formulario se ve tal cual, con un botón por tecla de su pie; la tecla va sola', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const onAnswer = vi.fn();
    const onKey = vi.fn();
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
    const Harness = () => {
      const { prompts, errors } = useTmuxPrompts();
      return <TmuxPromptBanner prompts={prompts} errors={errors} onAnswer={onAnswer} onKey={onKey} />;
    };
    render(<Harness />);
    act(() => { publishTmuxPrompts([form]); });

    // Con los espacios tal cual: alinean los valores del formulario.
    const pre = screen.getByText((_, element) => element?.tagName === 'PRE');
    expect(pre.textContent).toContain('❯ Also scan shell history     false');
    expect(screen.getByRole('button', { name: 'Enter · continue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esc · cancel' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bajar' }));
    expect(onKey).toHaveBeenCalledWith(form, 'Down');
    expect(onAnswer).not.toHaveBeenCalled();
    // Hasta que el pane cambia de pantalla, no se manda otra.
    expect(screen.getByRole('button', { name: 'Esc · cancel' })).toHaveProperty('disabled', true);
  });
});

describe('chat: AskUserQuestion de selección múltiple con varias preguntas', () => {
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

  const renderBanner = (onAnswer = vi.fn(), onKey = vi.fn()) => {
    const Harness = () => {
      const { prompts, errors } = useTmuxPrompts();
      return <TmuxPromptBanner prompts={prompts} errors={errors} onAnswer={onAnswer} onKey={onKey} />;
    };
    render(<Harness />);
    return { onAnswer, onKey };
  };

  it('pestañas con la activa, casillas con lo que dice el pane, y Siguiente / Anterior', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const { onAnswer, onKey } = renderBanner();
    act(() => { publishTmuxPrompts([MULTI]); });

    const tabs = screen.getByTestId('tmux-prompt-tabs');
    expect(tabs.querySelector('[aria-current="step"]')?.textContent).toBe('Dias');
    expect(screen.getByText(/Selección múltiple/)).toBeTruthy();

    expect(screen.getByRole('checkbox', { name: '1. Lunes' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: '2. Martes' }).getAttribute('aria-checked')).toBe('false');
    // "Next" no es una casilla ni un botón suelto: es "Siguiente".
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    // "Type something" es un campo, no una casilla.
    expect(screen.queryByRole('checkbox', { name: /Type something/ })).toBeNull();
    expect(screen.getByLabelText('Escribí tu respuesta')).toBeTruthy();
    // ←/→ no se repiten en la fila de teclas; Esc sí queda.
    expect(screen.queryByRole('button', { name: 'Izquierda' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Esc · cancel' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }));
    expect(onAnswer).toHaveBeenCalledWith(MULTI, 3);
    // La tarjeta muestra lo que el pane dibuja después: llega otra pantalla y se desbloquea.
    act(() => {
      publishTmuxPrompts([{
        ...MULTI,
        id: 'huella-multi-2',
        opciones: MULTI.opciones.map((opcion) => (opcion.indice === 1 ? { ...opcion, marcada: true } : opcion)),
      }]);
    });
    expect(screen.getByRole('checkbox', { name: '2. Martes' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '← Anterior' }));
    expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ id: 'huella-multi-2' }), 'Left');
  });

  it('en la última pregunta el botón es "Enviar"; sin renglón "Next" va → con "Revisar y enviar"', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    const { onAnswer, onKey } = renderBanner();
    const ultima: TmuxPrompt = {
      ...MULTI,
      opciones: MULTI.opciones.map((opcion) => (opcion.avance ? { ...opcion, etiqueta: 'Submit' } : opcion)),
    };
    act(() => { publishTmuxPrompts([ultima]); });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onAnswer).toHaveBeenCalledWith(ultima, 3);

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
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y enviar →' }));
    expect(onKey).toHaveBeenCalledWith(unica, 'Right');
  });

  it('si el pane no cambia después del clic, a los 4 s deja de decir "Enviando…"', async () => {
    await loadLanguage('es');
    await i18n.changeLanguage('es');
    vi.useFakeTimers();
    try {
      renderBanner();
      act(() => { publishTmuxPrompts([MULTI]); });
      fireEvent.click(screen.getByRole('checkbox', { name: '2. Martes' }));
      expect(screen.getByRole('checkbox', { name: '1. Lunes' })).toHaveProperty('disabled', true);
      act(() => { vi.advanceTimersByTime(4100); });
      expect(screen.getByRole('checkbox', { name: '1. Lunes' })).toHaveProperty('disabled', false);
    } finally {
      vi.useRealTimers();
    }
  });
});
