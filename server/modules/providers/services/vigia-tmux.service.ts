/**
 * Vigía del tmux de cada sesión, para que la barra pase de libre a dormida (y
 * al revés) sin recargar.
 *
 * Bug del 07-oct: el `tmux.vivo` de una fila solo se recalculaba al listar o
 * cuando el registro (`~/.cache/aos/sesiones.json`) indexaba una sesión
 * nueva. Un pane que moría —`/exit`, `orquestar.py dormir`, la hibernación
 * del gobernador— o que el orquestador despertaba no le avisaba a nadie: la
 * fila quedaba con el estado de la última carga.
 *
 * Cada pasada compara el "vivo efectivo" de cada sesión (registro × `tmux
 * list-sessions`) con el de la pasada anterior y devuelve las que cambiaron.
 * La primera pasada solo toma la foto: no hay nada contra qué comparar.
 */
export type VigiaTmuxDeps = {
  leerVivos: () => Promise<Map<string, boolean>>;
  diferencias: (antes: ReadonlyMap<string, boolean>, despues: ReadonlyMap<string, boolean>) => string[];
};

export function crearVigiaTmux({ leerVivos, diferencias }: VigiaTmuxDeps): () => Promise<string[]> {
  let anterior: Map<string, boolean> | null = null;
  let enCurso = false;

  return async () => {
    // Una pasada lenta (tmux que tarda) no se encima con la siguiente.
    if (enCurso) return [];
    enCurso = true;
    try {
      const actual = await leerVivos();
      const cambiadas = anterior ? diferencias(anterior, actual) : [];
      anterior = actual;
      return cambiadas;
    } finally {
      enCurso = false;
    }
  };
}
