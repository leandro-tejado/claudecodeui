import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it } from 'vitest';

import { pasoRevelado, useRevelado } from '@/modules/chat/utils/revelado';

describe('pasoRevelado', () => {
  it('paces in ~8 steps while active', () => {
    // 16 pending chars, active: ceil(16/8) = 2 per frame.
    assert.equal(pasoRevelado(0, 16, true), 2);
  });

  it('never steps by less than 2, even with one char left', () => {
    assert.equal(pasoRevelado(9, 10, true), 10);
  });

  it('drains in ~3 steps once inactive', () => {
    // 9 pending, inactive: ceil(9/3) = 3 per frame.
    assert.equal(pasoRevelado(0, 9, false), 3);
  });

  it('never overshoots the target', () => {
    assert.equal(pasoRevelado(0, 1, true), 1);
    assert.equal(pasoRevelado(0, 1, false), 1);
  });

  it('is a no-op once caught up', () => {
    assert.equal(pasoRevelado(5, 5, true), 5);
    assert.equal(pasoRevelado(5, 5, false), 5);
  });
});

describe('useRevelado', () => {
  let queue: FrameRequestCallback[] = [];

  beforeEach(() => {
    queue = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    queue = [];
  });

  function flush() {
    const pending = queue;
    queue = [];
    for (const cb of pending) cb(0);
  }

  it('shows the target immediately when revelar is false — the history case', () => {
    const { result } = renderHook(() => useRevelado('todo el texto', false));
    assert.equal(result.current, 'todo el texto');
    assert.equal(queue.length, 0, 'no frame scheduled for history');
  });

  it('starts empty and grows across frames when revelar is true', () => {
    const { result } = renderHook(() => useRevelado('hello world', true));
    assert.equal(result.current, '', 'nothing shown before the first frame');

    act(() => flush());
    assert.equal(result.current, 'he'); // max(2, ceil(11/8)) = 2

    act(() => flush());
    assert.equal(result.current, 'hell'); // pendiente 9 -> ceil(9/8) = 2

    // Keep flushing until it catches up to the full target.
    for (let i = 0; i < 10 && result.current !== 'hello world'; i += 1) {
      act(() => flush());
    }
    assert.equal(result.current, 'hello world');
    assert.equal(queue.length, 0, 'stops scheduling once caught up');
  });

  it('catches up to a static target within a bounded number of frames', () => {
    // A one-shot tmux reply never grows further, so the geometric ~1/8-per-frame
    // pace (not a fixed lag behind a moving target, which is what "~300ms" bounds
    // in a live SDK stream) has to fully drain here instead of just keeping pace.
    const objetivo = 'x'.repeat(64);
    const { result } = renderHook(() => useRevelado(objetivo, true));

    let frame = 0;
    while (result.current.length < objetivo.length && frame < 60) {
      act(() => flush());
      frame += 1;
    }

    assert.equal(result.current, objetivo);
    assert.equal(queue.length, 0, 'stops scheduling once caught up');
  });

  it('growing the target keeps revealing from where it left off, not from zero', () => {
    let objetivo = 'hola';
    const { result, rerender } = renderHook(({ o, r }) => useRevelado(o, r), {
      initialProps: { o: objetivo, r: true },
    });

    act(() => flush());
    const mostradosAntes = result.current.length;
    assert.ok(mostradosAntes > 0);

    objetivo = 'hola, esto creció';
    rerender({ o: objetivo, r: true });

    // The already-revealed prefix survives the growth instead of resetting.
    assert.equal(result.current, 'hola'.slice(0, mostradosAntes));
  });

  it('arrancarVacio=false shows whatever is already there at mount, not empty — the SDK placeholder case', () => {
    // The streaming placeholder already holds real accumulated text the first
    // time it renders (the realtime handler only creates it after the first
    // buffered chunk), so there is nothing earlier to hide.
    const { result } = renderHook(() => useRevelado('already accumulated text', true, false));
    assert.equal(result.current, 'already accumulated text');
    assert.equal(queue.length, 0, 'nothing to animate for content already on screen at mount');
  });

  it('arrancarVacio=false only animates growth after mount, never the content that was already there', () => {
    let objetivo = 'primeros veinte caracteres';
    const { result, rerender } = renderHook(({ o, r }) => useRevelado(o, r, false), {
      initialProps: { o: objetivo, r: true },
    });

    // Nothing hidden at mount: the whole initial chunk is visible immediately.
    assert.equal(result.current, objetivo);
    assert.equal(queue.length, 0);

    objetivo = `${objetivo} y ahora crece con una oración nueva`;
    rerender({ o: objetivo, r: true });

    // The part that was already shown never disappears; only the new tail
    // needs frames to catch up.
    assert.ok(result.current.startsWith('primeros veinte caracteres'));
    assert.ok(result.current.length < objetivo.length, 'the new tail paces in, not all at once');

    let frame = 0;
    while (result.current !== objetivo && frame < 60) {
      act(() => flush());
      frame += 1;
    }
    assert.equal(result.current, objetivo);
  });

  it('prefers-reduced-motion shows everything immediately even when revelar is true', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    try {
      const { result } = renderHook(() => useRevelado('todo de una', true));
      assert.equal(result.current, 'todo de una');
      assert.equal(queue.length, 0, 'no animation scheduled');
    } finally {
      window.matchMedia = original;
    }
  });

  it('snaps to the full target the moment revelar turns false', () => {
    const objetivo = 'una respuesta completa que llegó de una vez';
    const { result, rerender } = renderHook(({ r }) => useRevelado(objetivo, r), {
      initialProps: { r: true },
    });

    act(() => flush());
    assert.ok(result.current.length < objetivo.length, 'still mid-reveal');

    rerender({ r: false });
    assert.equal(result.current, objetivo);
  });
});
