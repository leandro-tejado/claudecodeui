import assert from 'node:assert/strict';

import { act, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, test } from 'vitest';

import SkinContextRing from '@/modules/skin/SkinContextRing';
import { publishContextMeter } from '@/modules/skin/contextMeterStore';

/**
 * The header ring, in the two states that matter: a window it can measure
 * against, and none. The second is the one the 11-sep fix rests on — with no
 * confirmed window the ring must stay dark rather than print a number.
 */

beforeEach(() => {
  act(() => publishContextMeter(null, null));
});

test('a measurable budget renders its percentage', () => {
  // The numbers from the reported session: 336.541 tokens of a 1M window.
  act(() => publishContextMeter({ used: 336_541, total: 1_000_000 }, null));
  const view = render(<SkinContextRing />);

  assert.match(view.container.textContent ?? '', /34%/);
  assert.equal(view.container.querySelectorAll('[role="progressbar"]').length, 1);
});

test('the percentage hides on narrow screens instead of squeezing the title', () => {
  act(() => publishContextMeter({ used: 336_541, total: 1_000_000 }, null));
  const view = render(<SkinContextRing />);

  const percent = [...view.container.querySelectorAll('span')].find((node) => node.textContent === '34%');
  assert.ok(percent);
  assert.ok(percent.className.includes('hidden'));
  assert.ok(percent.className.includes('sm:inline'));
});

test('with no window confirmed nothing is claimed', () => {
  act(() => publishContextMeter({ used: 336_541, total: null }, null));
  const view = render(<SkinContextRing />);

  assert.equal(view.container.textContent, '');
  assert.equal(view.container.querySelector('button'), null);
});

test('an untouched session shows no ring either', () => {
  act(() => publishContextMeter({ used: 0, total: 1_000_000 }, null));
  const view = render(<SkinContextRing />);

  assert.equal(view.container.textContent, '');
});

test('a full context clamps at 100 rather than overflowing', () => {
  act(() => publishContextMeter({ used: 1_200_000, total: 1_000_000 }, null));
  const view = render(<SkinContextRing />);

  assert.match(view.container.textContent ?? '', /100%/);
});

test('clicking opens the detailed breakdown the composer used to own', () => {
  let opened = 0;
  act(() => publishContextMeter({ used: 100, total: 1_000 }, () => { opened += 1; }));
  const view = render(<SkinContextRing />);

  view.container.querySelector('button')?.click();
  assert.equal(opened, 1);
});
