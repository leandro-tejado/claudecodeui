import assert from 'node:assert/strict';

import { test } from 'vitest';

import { removeOptimisticUserEchoes } from '@/modules/chat/utils/sessionMessageReconciliation';
import type { NormalizedMessage } from '@/shared/types';

/**
 * The realtime handler casts raw `ServerEvent` frames straight into
 * `NormalizedMessage`, and on that wire every field is optional. A frame that
 * arrived without an id reached this filter, `message.id.startsWith` threw, and
 * the exception escaped mid-React-update: the tree stayed half-committed and
 * the composer stopped responding — Enter no longer sent anything until the
 * page was reloaded.
 */

const message = (fields: Partial<NormalizedMessage>) => fields as NormalizedMessage;

test('a frame without an id does not throw and is kept', () => {
  const realtime = [
    message({ kind: 'text', role: 'assistant', content: 'hola', sessionId: 's1' }),
    message({ id: 'local_1', kind: 'text', role: 'user', content: 'hi', sessionId: 's1', timestamp: new Date().toISOString() }),
  ];

  const kept = removeOptimisticUserEchoes([], realtime);

  assert.equal(kept.length, 2, 'nothing is dropped when there is no server echo to match');
});

test('an optimistic row is still retired by its server echo', () => {
  const now = new Date().toISOString();
  const realtime = [
    message({ id: 'local_1', kind: 'text', role: 'user', content: 'hi', sessionId: 's1', timestamp: now }),
  ];
  const server = [
    message({ id: 'server_1', kind: 'text', role: 'user', content: 'hi', sessionId: 's1', timestamp: now }),
  ];

  const kept = removeOptimisticUserEchoes(server, realtime);

  assert.equal(kept.length, 0, 'the local echo must give way to the persisted turn');
});
