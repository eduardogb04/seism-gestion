// Fixture: TIENE que ser rechazado por `sin-error-crudo/throwErrorCrudo`
// (F0-23), sin `new` y con otro error nativo: dentro de `src/casos-uso/`
// tampoco se lanza un error sin código. No se corrige.

export function exigir(valor: string | undefined): string {
  if (valor === undefined) {
    throw Error("falta el valor");
  }
  if (valor === "") {
    throw new RangeError("valor vacío");
  }
  return valor;
}
