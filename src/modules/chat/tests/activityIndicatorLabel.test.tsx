import assert from 'node:assert/strict';

import { render, screen } from '@testing-library/react';
import React from 'react';
import { test, vi } from 'vitest';

import '@/modules/i18n';
import ActivityIndicator from '@/modules/chat/composer/ActivityIndicator';
import type { SessionActivity } from '@/shared/types';

/**
 * Fase 5, paso 7: la línea de actividad dice "pensando" o el nombre de la tool,
 * nunca palabras de relleno que rotan con el reloj, y se calla mientras llega
 * la respuesta (`statusText: ''`) sin perder el Stop ni el tiempo.
 */

const activity = (statusText: string | null, segundos = 0): SessionActivity => ({
  statusText,
  canInterrupt: true,
  startedAt: Date.now() - segundos * 1000,
});

test('sin tool en curso dice "Thinking" aunque pasen segundos: no rota palabras', () => {
  const { container } = render(<ActivityIndicator activity={activity(null, 9)} onAbort={vi.fn()} />);
  assert.match(container.textContent ?? '', /Thinking…/);
  assert.match(container.textContent ?? '', /9s/);
});

test('con una tool en curso la línea es su nombre', () => {
  const { container } = render(<ActivityIndicator activity={activity('Bash')} onAbort={vi.fn()} />);
  assert.match(container.textContent ?? '', /Bash…/);
  assert.doesNotMatch(container.textContent ?? '', /Thinking/);
});

test('mientras llega la respuesta la etiqueta se calla, pero quedan el tiempo y el Stop', () => {
  const { container } = render(<ActivityIndicator activity={activity('', 3)} onAbort={vi.fn()} />);
  assert.doesNotMatch(container.textContent ?? '', /…/);
  assert.match(container.textContent ?? '', /3s/);
  assert.ok(screen.getByRole('button', { name: 'Stop' }));
});
