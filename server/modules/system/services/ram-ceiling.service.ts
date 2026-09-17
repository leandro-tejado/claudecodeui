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

function parsearMeminfo(meminfoTexto: string): { totalKb: number; disponibleKb: number } | null {
  const total = /^MemTotal:\s+(\d+)/m.exec(meminfoTexto);
  const disponible = /^MemAvailable:\s+(\d+)/m.exec(meminfoTexto);
  if (!total || !disponible) {
    return null;
  }

  const totalKb = Number(total[1]);
  if (!totalKb) {
    return null;
  }

  return { totalKb, disponibleKb: Number(disponible[1]) };
}

/**
 * % de RAM usada a partir de `/proc/meminfo`. Usa `MemAvailable` (no
 * `MemFree`) porque ese campo ya descuenta el cache/buffers reclamable, que
 * en un VPS de este tamaño es la mayor parte de la memoria "libre" en el
 * papel.
 */
export function calcularPorcentajeRamUsada(meminfoTexto: string): number | null {
  const parseado = parsearMeminfo(meminfoTexto);
  if (!parseado) {
    return null;
  }
  const usadaKb = parseado.totalKb - parseado.disponibleKb;
  return (usadaKb / parseado.totalKb) * 100;
}

const KB_POR_GB = 1024 * 1024;

export type MedicionRam = {
  porcentajePct: number | null;
  usadaGb: number | null;
  totalGb: number | null;
};

/** Igual que `calcularPorcentajeRamUsada`, pero sin re-parsear para sumar los GB crudos que pide el popover de recursos (Fase 3). */
export function medirRamDesdeTexto(meminfoTexto: string): MedicionRam {
  const parseado = parsearMeminfo(meminfoTexto);
  if (!parseado) {
    return { porcentajePct: null, usadaGb: null, totalGb: null };
  }
  const usadaKb = parseado.totalKb - parseado.disponibleKb;
  return {
    porcentajePct: (usadaKb / parseado.totalKb) * 100,
    usadaGb: usadaKb / KB_POR_GB,
    totalGb: parseado.totalKb / KB_POR_GB,
  };
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
