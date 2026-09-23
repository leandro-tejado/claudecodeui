import { describe, expect, test } from 'vitest';

import { apiErrorText } from '@/shared/apiErrorText';

describe('apiErrorText', () => {
  // The exact envelope from server/index.ts, which is what React error #31
  // reported on the phone: "object with keys {code, message}".
  test('flattens the server error envelope', () => {
    expect(apiErrorText({ code: 'INTERNAL_ERROR', message: 'Internal server error' })).toBe(
      'Internal server error (INTERNAL_ERROR)',
    );
  });

  test('reads through a full response body', () => {
    expect(apiErrorText({ success: false, error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Session expired' } })).toBe(
      'Session expired (AUTH_TOKEN_EXPIRED)',
    );
  });

  test('leaves a plain string alone', () => {
    expect(apiErrorText('Invalid credentials')).toBe('Invalid credentials');
  });

  test('falls back to the code when there is no message', () => {
    expect(apiErrorText({ code: 'NOT_A_GIT_REPOSITORY' })).toBe('NOT_A_GIT_REPOSITORY');
  });

  test('returns null for nothing usable, so callers apply their own fallback', () => {
    expect(apiErrorText(null)).toBeNull();
    expect(apiErrorText(undefined)).toBeNull();
    expect(apiErrorText('   ')).toBeNull();
    expect(apiErrorText({})).toBeNull();
  });

  test('never returns an object, whatever it is handed', () => {
    for (const value of [{ a: 1 }, [1, 2], { error: { nested: true } }, 42, true]) {
      const result = apiErrorText(value);
      expect(result === null || typeof result === 'string').toBe(true);
    }
  });
});
