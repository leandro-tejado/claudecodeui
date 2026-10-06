export { default as UsageWindowIndicator } from '@/modules/usage-window/UsageWindowIndicator';
// Exportado para el anillo de contexto del skin: las reglas del repo obligan a
// cruzar módulos por el barril, y los dos anillos tienen que ser el mismo.
export { CircleProgress } from '@/modules/usage-window/CircleProgress';
export { useUsageWindow } from '@/modules/usage-window/useUsageWindow';
export { useUsageDetalle } from '@/modules/usage-window/useUsageDetalle';
export type {
  UsageWindowSnapshot,
  UsageDetalle,
  DetalleSesion,
  DetallePorSkill,
  GobernadorEstado,
} from '@/modules/usage-window/types';
// Las lecturas contra el reloj y la hora de reset, que el módulo de cuentas
// reutiliza para sus medidores y el aviso de tope: una sola forma de leerlas.
export { evaluarVentana, formatResetTime } from '@/modules/usage-window/estadoVentana';
export type { EstadoVentana } from '@/modules/usage-window/estadoVentana';
