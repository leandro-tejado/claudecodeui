/*
 * Los cortes de color de la barra de compactación, fuera del componente.
 *
 * Viven acá por dos razones. La del plan: que se puedan mover sin tocar el
 * JSX, y que un test mida el borde contra la constante en vez de contra un
 * número repetido. La del linter: un archivo que exporta un componente y
 * además constantes rompe el fast refresh de Vite.
 */

/** Dónde empieza el ámbar. */
export const AMBER_AT = 80;
/** Dónde empieza el rojo. */
export const RED_AT = 95;

/** El color del relleno según el tramo. Se clampea antes de llamarla. */
export const trackClass = (percent: number): string => {
  if (percent >= RED_AT) return 'bg-red-500';
  if (percent >= AMBER_AT) return 'bg-amber-500';
  return 'bg-primary';
};
