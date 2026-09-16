import { readFileSync } from 'node:fs';

/**
 * Techo de RAM del Paso 6 (Fase 5): por encima de este % de memoria usada no
 * se crean sesiones nuevas. Constante exportada a pedido del plan, para que
 * un test pueda referenciarla en vez de repetir el numero mágico.
 */
export const RAM_CEILING_PERCENT = 90;

function leerMeminfoReal(): string {
  return readFileSync('/proc/meminfo', 'utf8');
}

/**
 * % de RAM usada a partir de `/proc/meminfo`. Usa `MemAvailable` (no
 * `MemFree`) porque ese campo ya descuenta el cache/buffers reclamable, que
 * en un VPS de este tamaño es la mayor parte de la memoria "libre" en el
 * papel.
 */
export function calcularPorcentajeRamUsada(meminfoTexto: string): number | null {
  const total = /^MemTotal:\s+(\d+)/m.exec(meminfoTexto);
  const disponible = /^MemAvailable:\s+(\d+)/m.exec(meminfoTexto);
  if (!total || !disponible) {
    return null;
  }

  const totalKb = Number(total[1]);
  const disponibleKb = Number(disponible[1]);
  if (!totalKb) {
    return null;
  }

  const usadaKb = totalKb - disponibleKb;
  return (usadaKb / totalKb) * 100;
}

export type EstaSobreElTechoOptions = {
  leerMeminfo?: () => string;
};

export const ramCeilingService = {
  /**
   * Sin datos de memoria (no es Linux, `/proc/meminfo` no existe, etc.) no
   * bloquea: un gobernador que bloquea de más por falta de dato es peor que
   * uno que deja pasar.
   */
  estaSobreElTecho(options: EstaSobreElTechoOptions = {}): { sobreElTecho: boolean; porcentaje: number | null } {
    let texto: string;
    try {
      texto = (options.leerMeminfo ?? leerMeminfoReal)();
    } catch {
      return { sobreElTecho: false, porcentaje: null };
    }

    const porcentaje = calcularPorcentajeRamUsada(texto);
    if (porcentaje === null) {
      return { sobreElTecho: false, porcentaje: null };
    }

    return { sobreElTecho: porcentaje >= RAM_CEILING_PERCENT, porcentaje };
  },
};
