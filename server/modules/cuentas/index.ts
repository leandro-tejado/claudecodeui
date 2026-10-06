// cuentasRoutes: used by the server entrypoint to mount the protected account list at `/api/cuentas`.
export { default as cuentasRoutes } from './cuentas.routes.js';

// Account registry + credential resolution (server side only; the token never leaves this module's callers).
export {
  CUENTA_DEL_PROCESO,
  asegurarCuentaUsable,
  cuentaDeTmux,
  entornoParaCuenta,
  esIdDeCuentaValido,
  listarCuentas,
  prefijoShellDeCuenta,
  resolverCuenta,
  rutaArchivoCuota,
  validarCuenta,
} from './services/cuentas.service.js';
export type { CuentaPublica } from './services/cuentas.service.js';
