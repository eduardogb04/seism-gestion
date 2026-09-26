// Fixture: TIENE que ser rechazado por `sin-error-crudo/newErrorSistema`
// (F0-23): `ErrorSistema` se arma con `nuevoError`, nunca con `new`. No se
// corrige.

import { ErrorSistema } from "./compartido/errores/error-sistema.ts";

export function armar(): ErrorSistema {
  return new ErrorSistema("DOM-0001");
}
