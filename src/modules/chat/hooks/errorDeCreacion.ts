/*
 * El texto que se muestra cuando el servidor no deja crear una sesión.
 *
 * El servidor ya explica por qué (`{ error: { code, message } }`, el middleware
 * de `AppError`): el caso que lo motivó es el 409 del techo de RAM, «RAM del
 * servidor al N %…». Antes el cliente tiraba solo el código HTTP y ese motivo
 * se perdía. Si el cuerpo no trae mensaje, queda el código como antes.
 */
export async function mensajeDeErrorDeCreacion(response: Pick<Response, 'status' | 'json'>): Promise<string> {
  try {
    const body = await response.json();
    const mensaje = body?.error?.message ?? (typeof body?.error === 'string' ? body.error : null);
    if (typeof mensaje === 'string' && mensaje.trim()) return mensaje.trim();
  } catch {
    // Cuerpo vacío o que no es JSON: sirve el código.
  }
  return `Failed to create session (${response.status})`;
}
