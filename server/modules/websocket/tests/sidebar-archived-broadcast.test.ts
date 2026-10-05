import assert from 'node:assert/strict';
import test from 'node:test';

import {
  broadcastSidebarArchived,
  buildSidebarArchivedEvent,
} from '@/modules/websocket/services/sidebar-archived-broadcast.service.js';
import { connectedClients } from '@/modules/websocket/services/websocket-state.service.js';

class FakeConnection {
  constructor(public readyState = 1) {}

  frames: Array<Record<string, unknown>> = [];

  send(data: string): void {
    this.frames.push(JSON.parse(data) as Record<string, unknown>);
  }
}

test('el evento lleva los ids sin repetir y sin vacíos', () => {
  const event = buildSidebarArchivedEvent({
    projectIds: ['p1', 'p1', ''],
    sessionIds: ['s1', 's2', 's1'],
  });

  assert.equal(event?.kind, 'sidebar_archived');
  assert.deepEqual(event?.projectIds, ['p1']);
  assert.deepEqual(event?.sessionIds, ['s1', 's2']);
  assert.ok(event?.timestamp);
});

test('sin nada que sacar no hay evento', () => {
  assert.equal(buildSidebarArchivedEvent({}), null);
  assert.equal(buildSidebarArchivedEvent({ projectIds: [], sessionIds: [] }), null);
});

test('llega a los clientes abiertos y a los cerrados no', () => {
  connectedClients.clear();
  const abierto = new FakeConnection(1);
  const cerrado = new FakeConnection(3);
  connectedClients.add(abierto as never);
  connectedClients.add(cerrado as never);

  try {
    const sent = broadcastSidebarArchived({ projectIds: ['p1'], sessionIds: ['s1'] });

    assert.equal(sent, 1);
    assert.equal(abierto.frames.length, 1);
    assert.equal(abierto.frames[0]?.kind, 'sidebar_archived');
    assert.deepEqual(abierto.frames[0]?.projectIds, ['p1']);
    assert.deepEqual(abierto.frames[0]?.sessionIds, ['s1']);
    assert.equal(cerrado.frames.length, 0);

    assert.equal(broadcastSidebarArchived({}), 0);
    assert.equal(abierto.frames.length, 1, 'un delta vacío no se manda');
  } finally {
    connectedClients.clear();
  }
});
