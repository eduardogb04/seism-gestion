// Fixture: TIENE que ser rechazado por `sin-error-crudo/throwErrorCrudo`
// (F0-23): un error sin código del catálogo dentro de `src/dominio/`. Si el
// script deja de mirarlo, `npm run lint:fixtures` se pone en rojo. No se
// corrige.

export function partesValidas(partes: number): number {
  if (partes < 1) {
    throw new Error("partes inválidas");
  }
  return partes;
}
