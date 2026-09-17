/**
 * F0-14: el arnés del nivel casos de uso, probado con sus propias reglas.
 * "Los tests de casos de uso comparten un solo contenedor por corrida
 * (arranque una vez, base limpia por test con `TRUNCATE`)": acá se comprueba
 * lo segundo, que es lo que un test de este nivel va a dar por hecho.
 *
 * El primer test escribe una fila; el segundo, que corre después en el mismo
 * archivo y contra la misma base, la tiene que ver vacía. Si `limpiarBase()`
 * dejara de funcionar —o si alguien sacara el `beforeEach`—, el segundo test
 * se pone en rojo. Que el contenedor sea uno solo se ve en la corrida: este
 * archivo no levanta ninguno.
 *
 * Necesita Docker corriendo (RUNBOOK, sección 1).
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { crearClientePrisma } from "../../../src/adaptadores/prisma/cliente.ts";
import { limpiarBase, uriBaseCompartida } from "./base.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

describe("arnés de casos de uso: base limpia por test", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("la base compartida está migrada y arranca vacía", async () => {
    const db = cliente();

    expect(await db.configuracion.count()).toBe(0);

    await db.configuracion.create({
      data: { clave: "arnes.prueba", valor: "1" },
    });
    expect(await db.configuracion.count()).toBe(1);
  });

  test("el test anterior escribió, y este no ve ni una fila suya", async () => {
    const db = cliente();

    expect(await db.configuracion.findMany()).toEqual([]);
  });
});
