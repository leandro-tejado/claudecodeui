export { default as UsageWindowIndicator } from '@/modules/usage-window/UsageWindowIndicator';
// Exportado para el anillo de contexto del skin: las reglas del repo obligan a
// cruzar módulos por el barril, y los dos anillos tienen que ser el mismo.
export { CircleProgress } from '@/modules/usage-window/CircleProgress';
export { useUsageWindow } from '@/modules/usage-window/useUsageWindow';
export type { UsageWindowSnapshot } from '@/modules/usage-window/types';
