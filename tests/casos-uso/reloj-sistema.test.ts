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
import { aInstante } from "../../src/adaptadores/prisma/conversiones.ts";
import {
  crearRelojSistema,
  fechaHoraLocalDe,
} from "../../src/adaptadores/reloj/sistema.ts";
import { esAnterior } from "../../src/dominio/compartido/reloj.ts";

describe("crearRelojSistema", () => {
  it("dos lecturas seguidas nunca retroceden", () => {
    const reloj = crearRelojSistema();

    const primera = reloj.ahora();
    const segunda = reloj.ahora();

    expect(esAnterior(segunda, primera)).toBe(false);
  });

  it("21:30 de Argentina sigue siendo el mismo día aunque en UTC ya sea mañana", () => {
    const leida = fechaHoraLocalDe(new Date("2026-11-27T00:30:00.000Z"));
    expect([leida.anio, leida.mes, leida.dia, leida.hora]).toEqual([
      2026, 11, 26, 21,
    ]);
  });

  it("la lectura está a menos de 5 segundos de la hora real del sistema", () => {
    const reloj = crearRelojSistema();
    const antes = Date.now();

    const leida = reloj.ahora();

    // `FechaHora` es fecha civil argentina: se vuelve instante con -03:00.
    const leidaComoInstante = aInstante(leida).getTime();

    expect(Math.abs(leidaComoInstante - antes)).toBeLessThan(5000);
  });
});
