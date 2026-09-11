import assert from 'node:assert/strict';

import { render } from '@testing-library/react';
import React from 'react';
import { test, vi } from 'vitest';

import AuthLoadingScreen from '@/modules/auth/AuthLoadingScreen';

/** The splash must carry the LT wordmark and nothing that bounces. */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

test('the splash shows the LT wordmark and no upstream branding', () => {
  const view = render(<AuthLoadingScreen />);

  const logo = view.container.querySelector('img');
  assert.equal(logo?.getAttribute('src'), '/lt-wordmark.svg');
  assert.equal(logo?.getAttribute('alt'), 'LT Space');
  assert.equal(view.container.innerHTML.includes('CloudCLI'), false);
});

test('nothing animates and the loading state stays readable to a screen reader', () => {
  const view = render(<AuthLoadingScreen />);

  assert.equal(view.container.innerHTML.includes('animate-bounce'), false);
  assert.equal(view.container.querySelector('[role="status"]')?.getAttribute('aria-live'), 'polite');
  assert.ok(view.container.querySelector('.sr-only'));
});
