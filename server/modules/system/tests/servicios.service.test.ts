import assert from 'node:assert/strict';
import test from 'node:test';

import { clasificar, parsearServe, parsearSs, serviciosService } from '../services/servicios.service.js';

// Recortes reales del VPS, 9-oct-2026.
const SS = `LISTEN 0      4096                       0.0.0.0:22    0.0.0.0:*
LISTEN 0      4096                 127.0.0.53%lo:53    0.0.0.0:*
LISTEN 0      4096                     127.0.0.1:7681  0.0.0.0:* users:(("ttyd",pid=1202653,fd=14))
LISTEN 0      511                      127.0.0.1:3100  0.0.0.0:* users:(("node",pid=3615356,fd=22))
LISTEN 0      511                      127.0.0.1:3200  0.0.0.0:* users:(("next-server (v1",pid=3387103,fd=21))
LISTEN 0      511                      127.0.0.1:3001  0.0.0.0:* users:(("node",pid=10385,fd=22))
LISTEN 0      4096                     127.0.0.1:9000  0.0.0.0:*
LISTEN 0      4096                 100.77.186.53:2222  0.0.0.0:*
LISTEN 0      4096                 100.77.186.53:8446  0.0.0.0:*
LISTEN 0      4096                 100.77.186.53:443   0.0.0.0:*
LISTEN 0      4096                 100.77.186.53:8443  0.0.0.0:*
LISTEN 0      4096                          [::]:22       [::]:*
LISTEN 0      4096                             *:22000       *:* users:(("syncthing",pid=984552,fd=34))`;

const SERVE = `# Funnel on:
#     - https://leandro-servidor.taila8c262.ts.net:8443

https://leandro-servidor.taila8c262.ts.net:10000 (tailnet only)
|-- / proxy http://127.0.0.1:7681

https://leandro-servidor.taila8c262.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:3100

https://leandro-servidor.taila8c262.ts.net:8443 (Funnel on)
|-- /               proxy http://127.0.0.1:3200
|-- /fathom-webhook proxy http://127.0.0.1:3200/api/fathom/webhook

https://leandro-servidor.taila8c262.ts.net:8444 (tailnet only)
|-- / proxy http://127.0.0.1:3200

https://leandro-servidor.taila8c262.ts.net:8446 (tailnet only)
|-- / proxy http://127.0.0.1:3001`;

test('parsearSs saca dirección, puerto y proceso, también en IPv6 y con %iface', () => {
  const escuchas = parsearSs(SS);
  assert.deepEqual(escuchas.find((e) => e.puerto === 7681), { direccion: '127.0.0.1', puerto: 7681, proceso: 'ttyd' });
  assert.deepEqual(escuchas.find((e) => e.puerto === 53), { direccion: '127.0.0.53', puerto: 53, proceso: null });
  assert.equal(escuchas.filter((e) => e.puerto === 22).map((e) => e.direccion).join(','), '0.0.0.0,::');
});

test('parsearServe lee el puerto de afuera (443 sin número), el interno y el Funnel, sin repetir', () => {
  const rutas = parsearServe(SERVE);
  assert.deepEqual(rutas.find((r) => r.interno === 3100), { externo: 443, interno: 3100, funnel: false });
  assert.deepEqual(rutas.filter((r) => r.interno === 3200), [
    { externo: 8443, interno: 3200, funnel: true },
    { externo: 8444, interno: 3200, funnel: false },
  ]);
});

test('clasificar agrupa por exposición y nombra los conocidos', () => {
  const servicios = clasificar(parsearSs(SS), parsearServe(SERVE));
  const por = (p: number) => servicios.find((s) => s.puerto === p);

  assert.equal(por(22)?.exposicion, 'publico');
  assert.equal(por(22)?.nombre, 'sshd');
  assert.equal(por(3200)?.exposicion, 'publico', 'el Funnel lo hace público');
  assert.equal(por(3200)?.entrada, ':8443 (Funnel), :8444');
  assert.equal(por(3001)?.exposicion, 'tailnet');
  assert.equal(por(3001)?.entrada, ':8446');
  assert.equal(por(3100)?.nombre, 'servidor-code');
  assert.equal(por(2222)?.exposicion, 'tailnet');
  assert.equal(por(9000)?.exposicion, 'local');
  assert.equal(por(9000)?.nombre, 'sin nombre');
  assert.equal(por(22000)?.nombre, 'syncthing');
  // Las entradas de tailscaled y el DNS no son servicios.
  assert.equal(por(8446), undefined);
  assert.equal(por(443), undefined);
  assert.equal(por(53), undefined);
  // Una fila por puerto aunque escuche en v4 y v6.
  assert.equal(servicios.filter((s) => s.puerto === 22).length, 1);
});

test('listar sin tailscale igual devuelve los puertos; sin ss, el error y nada inventado', () => {
  const sinTailscale = serviciosService.listar((cmd) => {
    if (cmd === 'tailscale') throw new Error('no está');
    return SS;
  });
  assert.equal(sinTailscale.error, null);
  assert.equal(sinTailscale.servicios.find((s) => s.puerto === 3001)?.exposicion, 'local');

  const sinSs = serviciosService.listar(() => {
    throw new Error('ss no existe');
  });
  assert.deepEqual(sinSs.servicios, []);
  assert.match(sinSs.error ?? '', /^ss: /);
});
