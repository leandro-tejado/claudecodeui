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
});
