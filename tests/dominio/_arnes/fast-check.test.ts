import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { configuracion } from "./propiedad.ts";

/**
 * F0-15 · Meta-test **permanente**, no una demostración de una sola vez
 * (`docs/adr/0015-property-based.md`). La propiedad de acá es
 * deliberadamente falsa — "para todo par de enteros, `a + b` es mayor que
 * `a`", que es falsa apenas `b <= 0` — y lo que se afirma no es que la
 * propiedad sea cierta, sino que fast-check la encuentra rota: `failed` da
 * `true` y hay un contraejemplo. Si alguien reemplazara fast-check por un
 * doble que siempre dice que sí, o si `fc.check` dejara de explorar el
 * espacio de entradas, este test se pone en rojo.
 *
 * Usa `fc.check` (no `fc.assert`, que cortaría el test lanzando una
 * excepción en el primer contraejemplo) para poder inspeccionar el
 * `RunDetails` devuelto.
 */
describe("fast-check busca contraejemplos de verdad", () => {
  it("una propiedad falsa a propósito da failed=true, con contraejemplo", () => {
    const resultado = fc.check(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b > a),
      configuracion(),
    );

    expect(resultado.failed).toBe(true);
    expect(resultado.counterexample).not.toBeNull();
  });
});
