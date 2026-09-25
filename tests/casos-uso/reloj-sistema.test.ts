/**
 * F0-22, R6: el adaptador de reloj real (`src/adaptadores/reloj/sistema.ts`)
 * nace acá, la primera tarea que va a guardar fechas en la base — es el
 * único lugar fuera de `scripts/` y `tests/` donde `Date` está permitido
 * (el dominio no la puede tocar, F0-18). Va en `tests/casos-uso/` y no en
 * `tests/dominio/` porque ese nivel prohíbe consultar el reloj del sistema
 * (tabla de *Testing* de `AGENTS.md`); no necesita la base, pero comparte
 * nivel con `migraciones-completas.test.ts` por el mismo motivo.
 *
 * No hay punto de armado todavía (`src/infraestructura/arranque/`): nadie
 * inyecta este reloj en nada más. Queda para quien lo cree.
 */
import { describe, expect, it } from "vitest";
import { crearRelojSistema } from "../../src/adaptadores/reloj/sistema.ts";
import { esAnterior } from "../../src/dominio/compartido/reloj.ts";

describe("crearRelojSistema", () => {
  it("dos lecturas seguidas nunca retroceden", () => {
    const reloj = crearRelojSistema();

    const primera = reloj.ahora();
    const segunda = reloj.ahora();

    expect(esAnterior(segunda, primera)).toBe(false);
  });

  it("la lectura está a menos de 5 segundos de la hora real del sistema", () => {
    const reloj = crearRelojSistema();
    const antes = Date.now();

    const leida = reloj.ahora();

    // `FechaHora` es una fecha civil local (sin zona), así que se reconstruye
    // como `Date` local, no UTC: es la forma en que un adaptador la traduce.
    const leidaComoInstante = new Date(
      leida.anio,
      leida.mes - 1,
      leida.dia,
      leida.hora,
      leida.minuto,
      leida.segundo,
      leida.milisegundo,
    ).getTime();

    expect(Math.abs(leidaComoInstante - antes)).toBeLessThan(5000);
  });
});
