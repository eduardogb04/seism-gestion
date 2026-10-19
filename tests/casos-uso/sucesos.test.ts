/**
 * F3-01 · El registro de sucesos de un servicio (R7) contra el Postgres de
 * verdad del arnés: una entrada con fecha, texto y autor, con su auditoría, que
 * no se edita sino que se anula con un motivo. Las etapas en que se carga están
 * en `etapas.test.ts`. Datos inventados. Necesita Docker corriendo.
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
import { crearCasosUsoSucesos } from "../../src/casos-uso/servicios/sucesos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  OPERADOR,
  sembrarUsuarios,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { sembrarServicio } from "./_arnes/servicio.ts";

const HOY = (() => {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 10,
    minuto: 30,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
})();

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let admin: Actor;
let operador: Actor;
let exAdmin: Actor;
let servicioId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependencias() {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  };
}

const sucesos = () => crearCasosUsoSucesos(dependencias());

async function filas() {
  return {
    sucesos: await cliente().servicioSuceso.count(),
    auditoria: await cliente().auditoria.count(),
  };
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  await limpiarBase();
  const usuarios = await sembrarUsuarios(cliente(), [
    ADMIN_UNO,
    OPERADOR,
    EX_ADMIN,
  ]);
  const [primero, segundo, tercero] = usuarios.map(
    ({ id }): Actor => ({ tipo: "persona", usuarioId: id }),
  );
  if (primero === undefined || segundo === undefined || tercero === undefined) {
    throw new Error("no se sembraron los usuarios");
  }
  [admin, operador, exAdmin] = [primero, segundo, tercero];
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    usuarios[0]?.id ?? "",
  );
});

describe("cargar un suceso", () => {
  test("guarda fecha, texto y autor, con su auditoría; el listado trae el más nuevo primero", async () => {
    expect(sucesos().formulario().escrito).toEqual({ fecha: "2031-07-09" });

    await sucesos().crear(operador, servicioId, {
      fecha: "2031-07-02",
      texto: "  Llamó el cliente para cambiar el día  ",
    });
    await sucesos().crear(admin, servicioId, {
      fecha: "2031-07-05",
      texto: "Se reprogramó la visita",
    });

    const fila = await cliente().servicioSuceso.findFirstOrThrow({
      where: { texto: "Llamó el cliente para cambiar el día" },
    });
    expect(fila).toMatchObject({
      servicioId,
      fecha: new Date("2031-07-02T00:00:00.000Z"),
      motivoAnulacion: null,
      creadoPor: operador,
      eliminadoEn: null,
    });
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "ServicioSuceso", entidadId: fila.id },
    });
    expect(auditoria.map(({ accion }) => accion)).toEqual(["crear"]);
    expect(await sucesos().listar(servicioId)).toEqual([
      {
        id: expect.any(String),
        fecha: "05/07/2031",
        texto: "Se reprogramó la visita",
        autor: ADMIN_UNO.email,
      },
      {
        id: fila.id,
        fecha: "02/07/2031",
        texto: "Llamó el cliente para cambiar el día",
        autor: OPERADOR.email,
      },
    ]);
  });

  test("sin texto o con una fecha que no existe vuelve por campo y no escribe nada", async () => {
    const antes = await filas();

    expect(
      await sucesos().crear(admin, servicioId, {
        fecha: "2031-02-30",
        texto: "   ",
      }),
    ).toEqual({
      ok: false,
      errores: { fecha: expect.any(String), texto: "Escribí qué pasó." },
    });
    expect(await filas()).toEqual(antes);
  });

  test("quien no puede escribir servicios recibe AUT-0009; un servicio que no existe es DOM-0009", async () => {
    await expect(
      sucesos().crear(exAdmin, servicioId, {
        fecha: "2031-07-09",
        texto: "No",
      }),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
    await expect(
      sucesos().crear(admin, "00000000-0000-4000-8000-000000000000", {
        fecha: "2031-07-09",
        texto: "No",
      }),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    expect(await cliente().servicioSuceso.count()).toBe(0);
  });
});

describe("anular un suceso", () => {
  async function uno(): Promise<string> {
    await sucesos().crear(admin, servicioId, {
      fecha: "2031-07-09",
      texto: "Suceso cargado por error",
    });
    return (await cliente().servicioSuceso.findFirstOrThrow()).id;
  }

  test("no se edita: se anula con su motivo, sale del listado y queda en la auditoría", async () => {
    const id = await uno();

    expect(
      await sucesos().marcarAnulado(operador, id, {
        motivo: " Era de otro servicio ",
      }),
    ).toEqual({ ok: true });

    expect(
      await cliente().servicioSuceso.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({
      texto: "Suceso cargado por error",
      motivoAnulacion: "Era de otro servicio",
      eliminadoPor: operador,
    });
    expect(await sucesos().listar(servicioId)).toEqual([]);
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "ServicioSuceso", entidadId: id },
      orderBy: { en: "asc" },
    });
    expect(auditoria.map(({ accion }) => accion)).toEqual([
      "crear",
      "eliminar",
    ]);
  });

  test("sin motivo vuelve por campo y no se anula", async () => {
    const id = await uno();
    const antes = await filas();

    expect(await sucesos().marcarAnulado(admin, id, { motivo: "  " })).toEqual({
      ok: false,
      errores: { motivo: "Escribí el motivo de la anulación." },
    });
    expect(await filas()).toEqual(antes);
    expect(await sucesos().listar(servicioId)).toHaveLength(1);
  });

  test("uno que no existe o ya anulado es DOM-0009; quien no puede escribir, AUT-0009", async () => {
    const id = await uno();
    await expect(
      sucesos().marcarAnulado(exAdmin, id, { motivo: "No" }),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
    await sucesos().marcarAnulado(admin, id, { motivo: "Repetido" });

    for (const otro of [id, "no-es-un-id"]) {
      await expect(
        sucesos().marcarAnulado(admin, otro, { motivo: "Otra vez" }),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    }
  });
});
