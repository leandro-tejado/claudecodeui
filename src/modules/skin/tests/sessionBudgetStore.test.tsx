import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { beforeEach, test } from 'vitest';

import {
  publishSessionBudget,
  resetSessionBudgetStoreForTests,
  useSessionBudgets,
} from '@/modules/skin/sessionBudgetStore';

/**
 * A diferencia de `contextMeterStore`, este store no tiene filtro de sesión
 * activa: el punto del sidebar necesita el presupuesto de cada sesión viva,
 * la esté mirando alguien o no.
 */

beforeEach(() => {
  resetSessionBudgetStoreForTests();
});

test('dos sesiones vivas dan dos entradas', () => {
  const { result } = renderHook(() => useSessionBudgets());

  act(() => publishSessionBudget('ses-1', { inputTokens: 100_000, compactAt: 245_000 }));
  act(() => publishSessionBudget('ses-2', { inputTokens: 50_000, compactAt: 245_000 }));

  assert.equal(result.current.size, 2);
  assert.equal(result.current.get('ses-1')?.inputTokens, 100_000);
  assert.equal(result.current.get('ses-2')?.inputTokens, 50_000);
});

test('un frame sin el dato conserva el ultimo presupuesto conocido', () => {
  const { result } = renderHook(() => useSessionBudgets());

  act(() => publishSessionBudget('ses-1', { inputTokens: 100_000, compactAt: 245_000 }));
  act(() => publishSessionBudget('ses-1', { inputTokens: 120_000 }));

  assert.equal(result.current.get('ses-1')?.inputTokens, 120_000);
  assert.equal(result.current.get('ses-1')?.compactAt, 245_000);
});

test('sin sessionId no publica nada', () => {
  const { result } = renderHook(() => useSessionBudgets());

  act(() => publishSessionBudget(null, { inputTokens: 100_000, compactAt: 245_000 }));
  act(() => publishSessionBudget(undefined, { inputTokens: 100_000, compactAt: 245_000 }));

  assert.equal(result.current.size, 0);
});

test('un usage nulo borra la entrada de esa sesion', () => {
  const { result } = renderHook(() => useSessionBudgets());

  act(() => publishSessionBudget('ses-1', { inputTokens: 100_000, compactAt: 245_000 }));
  act(() => publishSessionBudget('ses-1', null));

  assert.equal(result.current.has('ses-1'), false);
});
