import { cn } from '@/shared/utils';
import { iconoDeCuenta, inicialDeCuenta, nombreDeCuenta } from '@/modules/cuentas/cuentas';

type Props = {
  /** Id de la cuenta; la inicial y el ícono salen de él. */
  cuenta: string;
  /** `md` para el header, `sm` para las filas del sidebar. */
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * La etiqueta de cuenta: ícono más inicial, en gris. Maletín + O = Optimum,
 * persona + P = Personal. Nunca lleva color de estado — el color queda para la
 * cuota — y el nombre completo va en el `title`, porque la inicial sola no
 * alcanza para quien no la aprendió todavía.
 */
export default function AccountChip({ cuenta, size = 'sm', className }: Props) {
  const nombre = nombreDeCuenta(cuenta);

  return (
    <span
      data-testid="account-chip"
      data-cuenta={cuenta}
      title={`Cuenta ${nombre}`}
      aria-label={`Cuenta ${nombre}`}
      className={cn(
        'inline-flex flex-none items-center gap-0.5 rounded-md bg-muted font-semibold text-muted-foreground',
        size === 'md' ? 'h-5 px-1.5' : 'h-4 px-1',
        className,
      )}
      style={{ fontSize: size === 'md' ? 'var(--skin-text-xs)' : '10px' }}
    >
      {iconoDeCuenta(cuenta, size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5')}
      {inicialDeCuenta(cuenta)}
    </span>
  );
}
