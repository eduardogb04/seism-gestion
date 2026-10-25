/**
 * F4-03 · La renovación de un contrato recurrente, contra el Postgres de verdad
 * del arnés. Un servicio con «vigencia hasta» tiene un vencimiento «Renovar
 * contrato» ese día, de origen calculado: lo crea el alta, lo mueve un cambio
 * de la vigencia y lo da de baja el que la borra, mientras siga pendiente. Datos
 * inventados. Necesita Docker corriendo.
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
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { crearCasosUsoServicios } from "../../src/casos-uso/servicios/servicios.ts";
import { crearCasosUsoVencimientos } from "../../src/casos-uso/servicios/vencimientos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type { EstadoServicio } from "../../src/dominio/servicios/estados.ts";
import {
  ADMIN_UNO,
  OPERADOR,
  sembrarUsuarios,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { llevarServicioA, sembrarServicio } from "./_arnes/servicio.ts";

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
let responsableId: string;

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

const servicios = () => crearCasosUsoServicios(dependencias());
const vencimientos = () => crearCasosUsoVencimientos(dependencias());

/** El escrito de un servicio recurrente con vigencia hasta `hasta`; `""` lo deja puntual, sin vigencia. */
async function escritoCon(hasta: string, titulo?: string): Promise<Escrito> {
  const dueño = await cliente().cliente.findFirstOrThrow();
  const tipo = await cliente().tipoServicio.findFirstOrThrow();
  return {
    clienteId: dueño.id,
    tipoServicioId: tipo.id,
    titulo: titulo ?? "Contrato de ejemplo",
    modalidad: hasta === "" ? "puntual" : "recurrente",
    responsableId,
    fechaPedido: "2031-07-01",
    vigenciaDesde: hasta === "" ? "" : "2031-08-01",
    vigenciaHasta: hasta,
    observaciones: "",
  };
}

async function alta(hasta: string): Promise<string> {
  const resultado = await servicios().crear(admin, await escritoCon(hasta));
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.id;
}

async function guardar(
  id: string,
  hasta: string,
  titulo?: string,
): Promise<void> {
  const resultado = await servicios().guardar(
    admin,
    id,
    await escritoCon(hasta, titulo),
  );
  expect(resultado, "no se guardó").toMatchObject({ ok: true });
}

function llevarA(id: string, ...recorrido: readonly EstadoServicio[]) {
  return llevarServicioA(
    dependencias().transaccional,
    admin,
    id,
    recorrido,
    HOY,
  );
}

/** Los vencimientos de contrato de la base, también los dados de baja, con el día y no la hora. */
async function deContrato() {
  const filas = await cliente().servicioVencimiento.findMany({
    where: { clase: "contrato" },
    orderBy: { creadoEn: "asc" },
  });
  return filas.map((fila) => ({
    ...fila,
    fecha: fila.fecha.toISOString().slice(0, 10),
  }));
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  await limpiarBase();
  const usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO, OPERADOR]);
  const primero = usuarios[0];
  if (primero === undefined) {
    throw new Error("no se sembraron los usuarios");
  }
  admin = { tipo: "persona", usuarioId: primero.id };
  responsableId = primero.id;
  // Deja sembrados el cliente y el tipo; el servicio puntual que arma no se usa.
  await sembrarServicio(cliente(), dependencias(), admin, responsableId);
});

describe("el alta", () => {
  test("con vigencia hasta crea «Renovar contrato» ese día, calculado, pendiente y sin sitio ni camión", async () => {
    const id = await alta("2032-03-15");

    const [contrato, ...otros] = await deContrato();
    expect(otros).toEqual([]);
    expect(contrato).toMatchObject({
      servicioId: id,
      clase: "contrato",
      fecha: "2032-03-15",
      descripcion: "Renovar contrato",
      origen: "calculado",
      estado: "pendiente",
      sitioId: null,
      camionId: null,
      motivoDescarte: null,
      eliminadoEn: null,
    });
    expect(contrato?.creadoPor).toEqual(admin);
  });

  test("un servicio puntual no crea ninguno", async () => {
    await alta("");

    expect(await cliente().servicioVencimiento.count()).toBe(0);
  });
});

describe("cambiar la vigencia", () => {
  test("mueve el mismo vencimiento a la fecha nueva, con su auditoría", async () => {
    const id = await alta("2032-03-15");
    const [antes] = await deContrato();

    await guardar(id, "2032-09-30");

    const [despues, ...otros] = await deContrato();
    expect(otros).toEqual([]);
    expect(despues).toMatchObject({
      id: antes?.id,
      fecha: "2032-09-30",
      origen: "calculado",
      estado: "pendiente",
      eliminadoEn: null,
    });
    const cambios = await cliente().auditoria.findMany({
      where: { entidad: "ServicioVencimiento", accion: "actualizar" },
    });
    expect(cambios).toHaveLength(1);
    expect(cambios[0]?.antes).toMatchObject({ fecha: "2032-03-15" });
    expect(cambios[0]?.despues).toMatchObject({ fecha: "2032-09-30" });
  });

  test("si se había corregido a mano, vuelve a origen calculado", async () => {
    const id = await alta("2032-03-15");
    const [contrato] = await deContrato();
    await llevarA(id, "cotizado", "adjudicado", "en_ejecucion", "finalizado");
    expect(
      await vencimientos().cambiarFecha(admin, contrato?.id ?? "", {
        fecha: "2032-04-01",
      }),
    ).toMatchObject({ ok: true });
    expect((await deContrato())[0]?.origen).toBe("manual");

    await guardar(id, "2032-09-30");

    expect((await deContrato())[0]).toMatchObject({
      fecha: "2032-09-30",
      origen: "calculado",
    });
  });

  test("guardar sin tocar la vigencia no escribe nada en los vencimientos", async () => {
    const id = await alta("2032-03-15");
    const [antes] = await deContrato();

    await guardar(id, "2032-03-15", "Otro título");

    expect(await deContrato()).toEqual([antes]);
  });
});

describe("borrar la vigencia", () => {
  test("da de baja el vencimiento si sigue pendiente", async () => {
    const id = await alta("2032-03-15");

    await guardar(id, "");

    const [contrato, ...otros] = await deContrato();
    expect(otros).toEqual([]);
    expect(contrato?.eliminadoEn).not.toBeNull();
    expect(contrato?.eliminadoPor).toEqual(admin);
    expect((await vencimientos().ver(id)).vencimientos).toEqual([]);
  });
});

describe("uno renovado o descartado no se toca", () => {
  test.each(["descartado", "renovado"])(
    "%s: borrar la vigencia lo deja como está, y cambiarla crea uno pendiente aparte",
    async (estado) => {
      const id = await alta("2032-03-15");
      const [original] = await deContrato();
      await cliente().servicioVencimiento.update({
        where: { id: original?.id ?? "" },
        data: {
          estado,
          motivoDescarte: estado === "descartado" ? "Motivo de ejemplo" : null,
        },
      });
      const [resuelto] = await deContrato();

      await guardar(id, "");
      expect(await deContrato()).toEqual([resuelto]);

      await guardar(id, "2033-01-31");
      const [primero, nuevo, ...otros] = await deContrato();
      expect(otros).toEqual([]);
      expect(primero).toEqual(resuelto);
      expect(nuevo).toMatchObject({
        fecha: "2033-01-31",
        estado: "pendiente",
        origen: "calculado",
      });
      expect(nuevo?.id).not.toBe(original?.id);
    },
  );
});

describe("la base", () => {
  test("no admite dos pendientes de contrato en un servicio, ni una clase que el dominio no conoce", async () => {
    const id = await alta("2032-03-15");
    const [contrato] = await deContrato();
    const otro = {
      servicioId: id,
      fecha: new Date("2032-05-01"),
      descripcion: "Renovar contrato",
      clase: "contrato",
      origen: "calculado",
      estado: "pendiente",
      creadoEn: new Date(),
      creadoPor: admin,
      actualizadoEn: new Date(),
      actualizadoPor: admin,
    };

    await expect(
      cliente().servicioVencimiento.create({ data: otro }),
    ).rejects.toThrow();
    await expect(
      cliente().servicioVencimiento.create({
        data: { ...otro, clase: "otra" },
      }),
    ).rejects.toThrow();
    // Con el primero resuelto, otro pendiente sí cabe.
    await cliente().servicioVencimiento.update({
      where: { id: contrato?.id ?? "" },
      data: { estado: "renovado" },
    });
    await expect(
      cliente().servicioVencimiento.create({ data: otro }),
    ).resolves.toBeDefined();
  });
});
