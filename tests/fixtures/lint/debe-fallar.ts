// Fixture: tiene que ser rechazado por `npm run lint` por dos reglas
// independientes (`noExplicitAny` y `noUnusedVariables`), no una sola, para
// que un rechazo no tape al otro. Por lo demás es válido. No se corrige:
// `npm run lint:fixtures` lo prueba a propósito e invierte el código de
// salida.

export function identidad(valor: any): any {
  const sinUsar = 42;
  return valor;
}
