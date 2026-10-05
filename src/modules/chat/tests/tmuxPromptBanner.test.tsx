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
