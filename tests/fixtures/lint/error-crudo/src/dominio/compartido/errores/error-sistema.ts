// Fixture, caso permitido (F0-23): el archivo que define `ErrorSistema` es el
// único que puede decir `new ErrorSistema(`. No tiene que aparecer como
// violación.

export class ErrorSistema extends Error {
  static crear(codigo: string): ErrorSistema {
    return new ErrorSistema(codigo);
  }
}
