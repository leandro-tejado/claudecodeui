import assert from 'node:assert/strict';

import { test } from 'vitest';

import { readBrowserNotification } from '@/modules/notifications/utils/browserNotificationPayload';

/**
 * The socket carries more than notifications — registration acks travel the
 * same channel — and the payload is built server-side, so this reader is the
 * only thing standing between a malformed frame and an empty toast.
 */

test('reads a complete notification frame', () => {
  const result = readBrowserNotification({
    type: 'notification',
    id: 'claude:abc:run.stopped',
    payload: {
      title: 'Mejorar diseño LT Space',
      body: 'Claude: Run completed',
      data: { tag: 'claude:abc:run.stopped', sessionId: 'abc', provider: 'claude', urlPath: '/session/abc' },
    },
  });

  assert.deepEqual(result, {
    title: 'Mejorar diseño LT Space',
    body: 'Claude: Run completed',
    tag: 'claude:abc:run.stopped',
    sessionId: 'abc',
    provider: 'claude',
    urlPath: '/session/abc',
  });
});

test('ignores the registration acknowledgement', () => {
  const result = readBrowserNotification({ type: 'registered', deviceId: 'abc', enabled: true });

  assert.equal(result, null, 'only frames of type "notification" may be rendered');
});

test('drops a notification with no title', () => {
  const result = readBrowserNotification({ type: 'notification', payload: { body: 'sin título' } });

  assert.equal(result, null, 'an untitled toast tells the user nothing');
});

test('drops a title that is only whitespace', () => {
  const result = readBrowserNotification({ type: 'notification', payload: { title: '   ' } });

  assert.equal(result, null);
});

test('survives a payload with no data block', () => {
  const result = readBrowserNotification({ type: 'notification', payload: { title: 'Listo' } });

  assert.deepEqual(result, {
    title: 'Listo',
    body: '',
    tag: undefined,
    sessionId: null,
    provider: null,
    urlPath: null,
  });
});

test('refuses frames that are not objects', () => {
  assert.equal(readBrowserNotification(null), null);
  assert.equal(readBrowserNotification('notification'), null);
  assert.equal(readBrowserNotification(42), null);
});
