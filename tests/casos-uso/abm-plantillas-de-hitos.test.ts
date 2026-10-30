/**
 * Lo propio de Plantillas de hitos (F6-02) contra el Postgres de verdad del
 * arnés: la lista de hitos del formulario, que se guarda en una tabla hija y
 * se reemplaza entera, con el tipo de servicio opcional. Lo común a todos los
 * ABM está en `abm.test.ts`. Datos inventados. Necesita Docker corriendo.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { PLANTILLAS_DE_HITOS } from "../../src/casos-uso/abm/plantillas-de-hitos.ts";
import { TIPOS_DE_SERVICIO } from "../../src/casos-uso/abm/tipos-de-servicio.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

const HOY = crearFechaHora({
  anio: 2031,
  mes: 7,
  dia: 9,
  hora: 10,
  minuto: 30,
  segundo: 0,
  milisegundo: 0,
});

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let admin: Actor;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function casos() {
  if (!HOY.ok) {
    throw new Error(HOY.mensaje);
  }
  return crearCasosUsoAbm({
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY.fechaHora),
    generadorId: crearGeneradorIdCrypto(),
  });
}

function escrito(cambios: Escrito = {}): Escrito {
  return {
    nombre: "Inspección de ejemplo",
    tipoServicioId: "",
    hitos: "Movilización\nInspección\nInforme",
    ...cambios,
  };
}

/** Los hitos guardados de una plantilla, en su orden. */
async function hitosGuardados(id: string): Promise<readonly string[]> {
  const items = await cliente().plantillaHitosItem.findMany({
    where: { plantillaId: id },
    orderBy: { orden: "asc" },
  });
  return items.map(({ texto }) => texto);
}

async function crear(cambios: Escrito = {}): Promise<string> {
  const alta = await casos().crear(
    admin,
    PLANTILLAS_DE_HITOS,
    escrito(cambios),
  );
  if (!alta.ok) {
    throw new Error(`no se dio de alta: ${JSON.stringify(alta.errores)}`);
  }
  return alta.registro.valor.id;
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  await limpiarBase();
  const [uno] = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
  if (uno === undefined) {
    throw new Error("falta el usuario sembrado");
  }
  admin = { tipo: "persona", usuarioId: uno.id };
});

describe("Plantillas de hitos: la lista", () => {
  test("se guarda en orden en la tabla hija, con el lugar de cada hito desde 1, y se vuelve a leer igual", async () => {
    const id = await crear();

    const items = await cliente().plantillaHitosItem.findMany({
      where: { plantillaId: id },
      orderBy: { orden: "asc" },
    });
    expect(items.map(({ orden, texto }) => [orden, texto])).toEqual([
      [1, "Movilización"],
      [2, "Inspección"],
      [3, "Informe"],
    ]);
    const { valor } = await casos().obtener(PLANTILLAS_DE_HITOS, id);
    expect(valor.hitos).toEqual(["Movilización", "Inspección", "Informe"]);
  });

  test("los hitos vacíos se descartan, los textos se recortan y sin ninguno se pide al menos uno", async () => {
    const id = await crear({ hitos: "  Uno  \n\n   \nDos\n" });
    expect(await hitosGuardados(id)).toEqual(["Uno", "Dos"]);

    expect(
      await casos().crear(
        admin,
        PLANTILLAS_DE_HITOS,
        escrito({ nombre: "Vacía", hitos: " \n  " }),
      ),
    ).toEqual({ ok: false, errores: { hitos: "Agregá al menos un hito." } });
    expect(
      await casos().crear(
        admin,
        PLANTILLAS_DE_HITOS,
        escrito({ nombre: "Larga", hitos: "x".repeat(201) }),
      ),
    ).toEqual({
      ok: false,
      errores: { hitos: "No puede pasar de 200 caracteres." },
    });
    expect(await cliente().plantillaHitos.count()).toBe(1);
  });

  test("editar reemplaza la lista entera (agregar, quitar y reordenar) y la auditoría guarda la de antes y la de después", async () => {
    const id = await crear();

    const editada = await casos().guardar(
      admin,
      PLANTILLAS_DE_HITOS,
      id,
      escrito({ hitos: "Informe\nMovilización\nCierre" }),
    );

    expect(editada).toMatchObject({ ok: true });
    expect(await hitosGuardados(id)).toEqual([
      "Informe",
      "Movilización",
      "Cierre",
    ]);
    const cambios = await cliente().auditoria.findFirstOrThrow({
      where: { entidad: "PlantillaHitos", accion: "actualizar" },
    });
    expect(cambios.antes).toMatchObject({
      hitos: ["Movilización", "Inspección", "Informe"],
    });
    expect(cambios.despues).toMatchObject({
      hitos: ["Informe", "Movilización", "Cierre"],
    });
  });

  test("guardar la misma lista no escribe nada; solo cambiar el orden sí", async () => {
    const id = await crear();
    const auditorias = () => cliente().auditoria.count();
    const antes = await auditorias();

    await casos().guardar(admin, PLANTILLAS_DE_HITOS, id, escrito());
    expect(await auditorias()).toBe(antes);

    await casos().guardar(
      admin,
      PLANTILLAS_DE_HITOS,
      id,
      escrito({ hitos: "Inspección\nMovilización\nInforme" }),
    );
    expect(await auditorias()).toBe(antes + 1);
  });
});

describe("Plantillas de hitos: el tipo de servicio", () => {
  test("es opcional: sin tipo es genérica; con tipo, solo uno vigente", async () => {
    const tipo = await casos().crear(admin, TIPOS_DE_SERVICIO, {
      nombre: "Tipo de ejemplo",
      descripcion: "",
      modalidad: "puntual",
      activo: "si",
    });
    if (!tipo.ok) {
      throw new Error("no se dio de alta el tipo");
    }
    const generica = await crear({ nombre: "Genérica" });
    const delTipo = await crear({
      nombre: "Del tipo",
      tipoServicioId: tipo.registro.valor.id,
    });

    expect(
      (await casos().obtener(PLANTILLAS_DE_HITOS, generica)).valor
        .tipoServicioId,
    ).toBeNull();
    expect(
      (await casos().obtener(PLANTILLAS_DE_HITOS, delTipo)).valor
        .tipoServicioId,
    ).toBe(tipo.registro.valor.id);
    expect(
      await casos().crear(
        admin,
        PLANTILLAS_DE_HITOS,
        escrito({ nombre: "Rota", tipoServicioId: crypto.randomUUID() }),
      ),
    ).toMatchObject({
      ok: false,
      errores: { tipoServicioId: expect.any(String) },
    });
  });

  test("un tipo con plantillas vigentes no se da de baja (DOM-0010)", async () => {
    const tipo = await casos().crear(admin, TIPOS_DE_SERVICIO, {
      nombre: "Tipo de ejemplo",
      descripcion: "",
      modalidad: "puntual",
      activo: "si",
    });
    if (!tipo.ok) {
      throw new Error("no se dio de alta el tipo");
    }
    await crear({ tipoServicioId: tipo.registro.valor.id });

    await expect(
      casos().marcarEliminado(admin, TIPOS_DE_SERVICIO, tipo.registro.valor.id),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });
  });
});

describe("Plantillas de hitos: el nombre", () => {
  test("no se repite entre las vigentes, sin distinguir mayúsculas; el de una dada de baja se puede volver a usar", async () => {
    const id = await crear({ nombre: "Inspección" });

    expect(
      await casos().crear(
        admin,
        PLANTILLAS_DE_HITOS,
        escrito({ nombre: "inspección" }),
      ),
    ).toMatchObject({ ok: false, errores: { nombre: expect.any(String) } });

    await casos().marcarEliminado(admin, PLANTILLAS_DE_HITOS, id);
    await crear({ nombre: "Inspección" });
    expect(await cliente().plantillaHitos.count()).toBe(2);
  });
});
