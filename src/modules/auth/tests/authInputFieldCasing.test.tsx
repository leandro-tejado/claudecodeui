import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';

import AuthInputField from '@/modules/auth/AuthInputField';

describe('AuthInputField', () => {
  // The bug this guards: iOS Safari capitalises the first letter of a text
  // input unless the field opts out, so the phone posted `Leandrotejado` for an
  // account stored as `leandrotejado` and the login came back invalid.
  test('never lets the keyboard rewrite what was typed', () => {
    render(
      <AuthInputField
        id="username"
        label="Username"
        value=""
        onChange={() => {}}
        placeholder="username"
        isDisabled={false}
      />,
    );

    const input = screen.getByLabelText('Username');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });
});
