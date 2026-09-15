import assert from 'node:assert/strict';

import { act, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, test } from 'vitest';

import SkinCompactBar from '@/modules/skin/SkinCompactBar';
import { AMBER_AT, RED_AT } from '@/modules/skin/compactBarThresholds';
import { publishContextMeter } from '@/modules/skin/contextMeterStore';

/**
 * The third header indicator: how far the session is from auto-compacting.
 *
 * Its yardstick is `inputTokens` against `compactAt` (245.000 with the
 * configured window), NOT `used` against the model window — those are different
 * denominators, and on a 1M session the context ring sits at 24% while this bar
 * is full. The states that matter: the two colour cuts, the honest gap when the
 * server could not assert a threshold, and past 100%, where the number stops
 * being useful and the words take over.
 */

const publish = (inputTokens: number, compactAt: number | null) =>
  act(() => publishContextMeter({ used: inputTokens, inputTokens, total: 1_000_000, compactAt }, null));

beforeEach(() => {
  act(() => publishContextMeter(null, null));
});

test('196.000 of 245.000 draws 80% and turns amber', () => {
  publish(196_000, 245_000);
  const view = render(<SkinCompactBar />);
  const bar = view.container.querySelector('[role="progressbar"]');

  assert.equal(bar?.getAttribute('aria-valuenow'), String(AMBER_AT));
  assert.match(view.container.textContent ?? '', /80%/);
  assert.match(bar?.querySelector('div')?.className ?? '', /bg-amber-500/);
});

test('233.000 of 245.000 turns red', () => {
  publish(233_000, 245_000);
  const view = render(<SkinCompactBar />);
  const bar = view.container.querySelector('[role="progressbar"]');

  assert.ok(Number(bar?.getAttribute('aria-valuenow')) >= RED_AT);
  assert.match(bar?.querySelector('div')?.className ?? '', /bg-red-500/);
});

test('a comfortable session stays on the neutral colour', () => {
  publish(120_000, 245_000);
  const view = render(<SkinCompactBar />);

  assert.match(view.container.querySelector('[role="progressbar"] div')?.className ?? '', /bg-primary/);
});

test('compactAt null draws no bar rather than a made-up 0%', () => {
  publish(196_000, null);
  const view = render(<SkinCompactBar />);

  assert.equal(view.container.querySelectorAll('[role="progressbar"]').length, 0);
  assert.equal(view.container.textContent, '');
});

test('260.000 of 245.000 says the compaction is overdue instead of a percentage', () => {
  publish(260_000, 245_000);
  const view = render(<SkinCompactBar />);
  const bar = view.container.querySelector('[role="progressbar"]');

  assert.match(view.container.textContent ?? '', /compactación atrasada/);
  assert.doesNotMatch(view.container.textContent ?? '', /106%/);
  // La barra se clampea aunque el número crudo se haya pasado.
  assert.equal(bar?.getAttribute('aria-valuenow'), '100');
  assert.match(bar?.getAttribute('aria-label') ?? '', /\/compact a mano/);
});

test('the tooltip states both raw numbers, not just the percentage', () => {
  publish(180_000, 245_000);
  const view = render(<SkinCompactBar />);

  assert.match(
    view.container.querySelector('[role="progressbar"]')?.getAttribute('aria-label') ?? '',
    /180K de 245K antes de compactar/,
  );
});

test('the number hides on narrow screens instead of squeezing the title', () => {
  publish(196_000, 245_000);
  const view = render(<SkinCompactBar />);

  assert.match(view.container.querySelector('span')?.className ?? '', /hidden .*sm:inline/);
  assert.match(view.container.querySelector('[role="progressbar"]')?.parentElement?.className ?? '', /flex-none/);
});

test('a null compactAt in a later budget keeps the previous threshold instead of blanking the bar', () => {
  publish(196_000, 245_000);
  // El turno siguiente llega sin el campo: el store lo conserva, como hace con `total`.
  act(() => publishContextMeter({ used: 200_000, inputTokens: 200_000, total: 1_000_000 }, null));
  const view = render(<SkinCompactBar />);

  assert.equal(view.container.querySelectorAll('[role="progressbar"]').length, 1);
  assert.match(view.container.textContent ?? '', /82%/);
});
