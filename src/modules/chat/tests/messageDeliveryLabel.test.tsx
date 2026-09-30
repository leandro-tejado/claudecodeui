import assert from 'node:assert/strict';

import { render, screen } from '@testing-library/react';
import { test } from 'vitest';

import { i18n, loadLanguage } from '@/modules/i18n';
import MessageComponent from '@/modules/chat/transcript/MessageComponent';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { ChatMessage, DiffLine, MessageDeliveryState } from '@/shared/types';

/*
 * Bug del 30-sep: el usuario tiene que saber, mirando su propio mensaje, si
 * salió, si está esperando o si no se mandó.
 */

const renderUserMessage = (deliveryState?: MessageDeliveryState) => {
  const message: ChatMessage = {
    type: 'user',
    content: 'hola',
    timestamp: '2026-09-30T12:00:00.000Z',
    ...(deliveryState ? { deliveryState } : {}),
  };
  return render(
    <UiPreferencesProvider>
      <MessageComponent message={message} prevMessage={null} createDiff={(): DiffLine[] => []} provider="claude" />
    </UiPreferencesProvider>,
  );
};

test('cada estado de entrega se nombra en la burbuja, en español', async () => {
  await loadLanguage('es');
  await i18n.changeLanguage('es');
  const expected: Array<[MessageDeliveryState, RegExp]> = [
    ['sending', /Enviando…/],
    ['sent', /Enviado/],
    ['queued', /En cola/],
    ['failed', /No se envió/],
  ];
  for (const [state, label] of expected) {
    const view = renderUserMessage(state);
    const node = screen.getByTestId('message-delivery-state');
    assert.equal(node.dataset.state, state);
    assert.match(node.textContent ?? '', label);
    view.unmount();
  }
  await i18n.changeLanguage('en');
});

test('un mensaje del historial no muestra estado', () => {
  renderUserMessage();
  assert.equal(screen.queryByTestId('message-delivery-state'), null);
});
