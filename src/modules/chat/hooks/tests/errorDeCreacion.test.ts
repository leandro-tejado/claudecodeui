import { describe, expect, it } from 'vitest';

import { mensajeDeErrorDeCreacion } from '@/modules/chat/hooks/errorDeCreacion';

const respuesta = (status: number, body: unknown) => ({
  status,
  json: async () => {
    if (body instanceof Error) throw body;
    return body;
  },
});

describe('mensajeDeErrorDeCreacion', () => {
  it('muestra el motivo del 409 de RAM en vez del código', async () => {
    const texto = await mensajeDeErrorDeCreacion(
      respuesta(409, {
        success: false,
        error: { code: 'RAM_CEILING_EXCEEDED', message: 'RAM del servidor al 93%, por encima del techo del 90%: no se crean sesiones nuevas.' },
      }),
    );
    expect(texto).toMatch(/^RAM del servidor al 93%/);
  });

  it('acepta el error como texto plano', async () => {
    expect(await mensajeDeErrorDeCreacion(respuesta(400, { error: 'falta el proyecto' }))).toBe('falta el proyecto');
  });

  it('sin cuerpo legible, deja el código', async () => {
    expect(await mensajeDeErrorDeCreacion(respuesta(500, new Error('no json')))).toBe('Failed to create session (500)');
  });
});
