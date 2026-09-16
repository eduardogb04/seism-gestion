// Fixture: TIENE que ser rechazado por `noRestrictedGlobals` (Date), porque
// está bajo `src/dominio/`. Es la prueba de que la regla del reloj (F0-18)
// sigue viva: si alguien la saca de `biome.json`, este archivo pasa el lint y
// `npm run lint:fixtures` se pone en rojo. No se corrige.

export function vencio(limite: number): boolean {
  return Date.now() > limite;
}

export function anioActual(): number {
  const ahora = new Date();
  return ahora.getFullYear();
}
