// Fixture, caso permitido (F0-23): fuera de `src/dominio/` y `src/casos-uso/`
// la regla no aplica (los bordes traducen errores de afuera). No tiene que
// aparecer como violación.

export function leer(texto: string): unknown {
  if (texto === "") {
    throw new Error("texto vacío");
  }
  return JSON.parse(texto);
}
