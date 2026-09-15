import assert from 'node:assert/strict';

import { act, render, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, test } from 'vitest';

import SkinContextMeterBridge from '@/modules/skin/SkinContextMeterBridge';
import { publishContextMeter, useContextMeter } from '@/modules/skin/contextMeterStore';

/**
 * The header's context ring reads this store, and the chat fills it.
 *
 * The property that matters is the one the server's abstention relies on: a
 * budget frame with no total must keep the total the transcript already
 * supplied. Without it the ring would go dark on every live turn and light up
 * again on every reload.
 */

beforeEach(() => {
  act(() => publishContextMeter(null, null));
});

test('a budget with a total is published as-is', () => {
  const { result } = renderHook(() => useContextMeter());

  act(() => publishContextMeter({ used: 336_541, total: 1_000_000 }, null));

  assert.equal(result.current?.used, 336_541);
  assert.equal(result.current?.total, 1_000_000);
});

test('a budget with no total keeps the one already known', () => {
  // The live socket abstains when the model id cannot tell a 200K session from
  // a 1M one; the transcript reader is the one that can. Dropping the total
  // here is what made the meter flicker between a number and nothing.
  const { result } = renderHook(() => useContextMeter());

  act(() => publishContextMeter({ used: 336_541, total: 1_000_000 }, null));
  act(() => publishContextMeter({ used: 341_000, total: null }, null));

  assert.equal(result.current?.used, 341_000);
  assert.equal(result.current?.total, 1_000_000);
});

test('with no total ever supplied there is nothing to measure against', () => {
  const { result } = renderHook(() => useContextMeter());

  act(() => publishContextMeter({ used: 4_000 }, null));

  assert.equal(result.current?.used, 4_000);
  assert.equal(result.current?.total, null);
});

test('a null usage clears the meter, total included', () => {
  // Switching sessions must not carry the previous one's window over.
  const { result } = renderHook(() => useContextMeter());

  act(() => publishContextMeter({ used: 336_541, total: 1_000_000 }, null));
  act(() => publishContextMeter(null, null));

  assert.equal(result.current, null);
});

test('republishing the same numbers does not wake the header', () => {
  // The composer re-renders on every keystroke; the header must not follow.
  let renders = 0;
  const { result } = renderHook(() => {
    renders += 1;
    return useContextMeter();
  });

  act(() => publishContextMeter({ used: 100, total: 1_000 }, null));
  const after = renders;
  act(() => publishContextMeter({ used: 100, total: 1_000 }, null));

  assert.equal(renders, after);
  assert.equal(result.current?.used, 100);
});

test('the bridge publishes on mount and clears on unmount', () => {
  const { result } = renderHook(() => useContextMeter());

  const view = render(
    <SkinContextMeterBridge usage={{ used: 50_000, total: 200_000 }} />,
  );
  assert.equal(result.current?.used, 50_000);
  // It is a data bridge: it must not paint anything into the composer.
  assert.equal(view.container.innerHTML, '');

  act(() => view.unmount());
  assert.equal(result.current, null);
});

/*
 * `inputTokens` y `compactAt` viajan con la misma regla pegajosa que `total`:
 * un turno que no los trae conserva el anterior en vez de apagar la barra. Sin
 * esto el indicador parpadearía en cada turno, que es la variante nerviosa del
 * bug del 11-sep que motivó la regla original.
 */

test('inputTokens and compactAt ride along with the budget', () => {
  const { result } = renderHook(() => useContextMeter());

  act(() => publishContextMeter(
    { used: 210_000, inputTokens: 196_000, total: 1_000_000, compactAt: 245_000 },
    null,
  ));

  assert.equal(result.current?.inputTokens, 196_000);
  assert.equal(result.current?.compactAt, 245_000);
  // La entrada corre más despacio que el total: son denominadores distintos.
  assert.ok((result.current?.inputTokens ?? 0) < (result.current?.used ?? 0));
});

test('a later budget without the fields keeps the previous ones instead of blanking them', () => {
  const { result } = renderHook(() => useContextMeter());

  act(() => publishContextMeter(
    { used: 210_000, inputTokens: 196_000, total: 1_000_000, compactAt: 245_000 },
    null,
  ));
  act(() => publishContextMeter({ used: 220_000, total: 1_000_000 }, null));

  assert.equal(result.current?.compactAt, 245_000);
  assert.equal(result.current?.inputTokens, 196_000);
});

test('inputTokens falls back to the breakdown when the budget nests it', () => {
  const { result } = renderHook(() => useContextMeter());

  act(() => publishContextMeter(
    { used: 210_000, total: 1_000_000, compactAt: 245_000, breakdown: { input: 196_000, output: 14_000 } },
    null,
  ));

  assert.equal(result.current?.inputTokens, 196_000);
});
