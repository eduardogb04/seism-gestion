/**
 * El calendario (F4-04, ADR 0046) contra el Postgres de verdad del arnés, sobre
 * un julio de 2031 con una entrada de cada tipo (y una vencida de más), cosas
 * que no tienen que aparecer (otro mes, ya pagado o cobrado, descartado, en
 * otra etapa) y saldos parciales: el importe de cada entrada es el saldo que ya
 * calculan *Por cobrar* y *Por pagar*. Datos inventados. Necesita Docker.
 *
 * Reloj fijo: 09/07/2031 (un miércoles; el 1 de julio fue martes).
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearLectorConfiguracion } from "../../src/adaptadores/prisma/configuracion.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearCasosUsoCalendario } from "../../src/casos-uso/calendario/calendario.ts";
import { crearCasosUsoVencimientos } from "../../src/casos-uso/servicios/vencimientos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import {
  altaDeServicio,
  conModalidad,
  llevarServicioA,
  sembrarServicio,
} from "./_arnes/servicio.ts";
import { ayudasDelTablero } from "./_arnes/tablero.ts";

const resultadoHoy = crearFechaHora({
  anio: 2031,
  mes: 7,
  dia: 9,
  hora: 10,
  minuto: 30,
  segundo: 0,
  milisegundo: 0,
});
if (!resultadoHoy.ok) {
  throw new Error(resultadoHoy.mensaje);
}
const HOY = resultadoHoy.fechaHora;

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let almacenTemporal: AlmacenTemporal;
let admin: Actor;
let ids: {
  facturaConSaldo: string;
  egresoConSaldo: string;
  egresoVencido: string;
  servicioConFactura: string;
  servicioQueFinaliza: string;
  servicioAdjudicado: string;
};

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependencias() {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
    configuracion: crearLectorConfiguracion(cliente()),
  };
}

const calendario = () => crearCasosUsoCalendario(dependencias());

const {
  altaDeCentro,
  altaDeCuenta,
  cargarFactura,
  cobrar,
  cargarEgreso,
  pagar,
} = ayudasDelTablero({
  dependencias: () => dependencias(),
  admin: () => admin,
  almacen: () => almacenTemporal.almacen,
});

beforeAll(async () => {
  prisma = crearClientePrisma(uriBaseCompartida());
  await limpiarBase();
  almacenTemporal = await crearAlmacenTemporal();
  const usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
  const primero = usuarios[0];
  if (primero === undefined) {
    throw new Error("no se sembró el usuario");
  }
  admin = { tipo: "persona", usuarioId: primero.id };

  const conFactura = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    primero.id,
  );
  const quienFinaliza = await altaDeServicio(
    cliente(),
    dependencias(),
    admin,
    primero.id,
    "Servicio que finaliza",
  );
  const adjudicado = await altaDeServicio(
    cliente(),
    dependencias(),
    admin,
    primero.id,
    "Servicio adjudicado de ejemplo",
  );
  const enEjecucion = ["cotizado", "adjudicado", "en_ejecucion"] as const;
  await conModalidad(cliente(), conFactura);
  await llevarServicioA(
    dependencias().transaccional,
    admin,
    conFactura,
    enEjecucion,
    HOY,
  );
  await llevarServicioA(
    dependencias().transaccional,
    admin,
    quienFinaliza,
    [...enEjecucion, "finalizado"],
    HOY,
  );
  await llevarServicioA(
    dependencias().transaccional,
    admin,
    adjudicado,
    ["cotizado", "adjudicado"],
    HOY,
  );

  // Inicios estimados: el de «Adjudicado» entra, el de «En ejecución» no (ya empezó).
  await cliente().servicio.update({
    where: { id: adjudicado },
    data: { fechaInicioEstimada: new Date("2031-07-25T00:00:00.000Z") },
  });
  await cliente().servicio.update({
    where: { id: conFactura },
    data: { fechaInicioEstimada: new Date("2031-07-26T00:00:00.000Z") },
  });

  // Vencimientos: uno pendiente y vencido, uno de agosto, uno descartado.
  const vencimientos = crearCasosUsoVencimientos(dependencias());
  for (const [fecha, descripcion] of [
    ["2031-07-05", "Habilitación de ejemplo"],
    ["2031-08-14", "Habilitación de agosto"],
    ["2031-07-15", "Habilitación descartada"],
  ] as const) {
    const resultado = await vencimientos.crear(admin, quienFinaliza, {
      fecha,
      descripcion,
    });
    expect(resultado).toMatchObject({ ok: true });
  }
  const descartado = await cliente().servicioVencimiento.findFirstOrThrow({
    where: { descripcion: "Habilitación descartada" },
  });
  expect(
    await vencimientos.marcarDescartado(admin, descartado.id, {
      motivo: "Ya no hace falta",
    }),
  ).toMatchObject({ ok: true });

  // Facturas: con un cobro a medias (1.000,00 + 21 % = 1.210,00), cobrada entera y de otro mes.
  const pesos = await altaDeCuenta("Caja en pesos", "ARS");
  const parcial = await cargarFactura(conFactura, {
    numero: "F-0001",
    fecha: "2031-06-20",
    vencimiento: "2031-07-12",
    importe: "1.000,00",
  });
  await cobrar(parcial, pesos, "2031-07-01", "200,00");
  const entera = await cargarFactura(conFactura, {
    numero: "F-0002",
    fecha: "2031-06-21",
    vencimiento: "2031-07-15",
    importe: "500,00",
    alicuota: "0",
  });
  await cobrar(entera, pesos, "2031-07-02", "500,00");
  await cargarFactura(conFactura, {
    numero: "F-0003",
    fecha: "2031-07-01",
    vencimiento: "2031-08-10",
    importe: "700,00",
  });

  // Egresos: uno vencido sin pagar, uno con un pago a medias, uno pagado, uno sin vencimiento.
  const centro = await altaDeCentro(
    "Oficina de ejemplo",
    "gestion_administrativa",
  );
  const vencido = await cargarEgreso({
    centroCostoId: centro,
    fecha: "2031-06-01",
    importe: "100,00",
    vencimiento: "2031-07-03",
  });
  const aMedias = await cargarEgreso({
    centroCostoId: centro,
    fecha: "2031-06-02",
    importe: "300,00",
    vencimiento: "2031-07-20",
  });
  await pagar(aMedias, pesos, "2031-07-04", "100,00");
  const pagado = await cargarEgreso({
    centroCostoId: centro,
    fecha: "2031-06-03",
    importe: "50,00",
    vencimiento: "2031-07-21",
  });
  await pagar(pagado, pesos, "2031-07-05", "50,00");
  await cargarEgreso({
    centroCostoId: centro,
    fecha: "2031-06-04",
    importe: "75,00",
  });
  // Vencido de un mes anterior: el calendario de julio no lo trae, los avisos sí.
  await cargarEgreso({
    centroCostoId: centro,
    fecha: "2031-06-05",
    importe: "20,00",
    vencimiento: "2031-06-10",
  });

  ids = {
    facturaConSaldo: parcial,
    egresoConSaldo: aMedias,
    egresoVencido: vencido,
    servicioConFactura: conFactura,
    servicioQueFinaliza: quienFinaliza,
    servicioAdjudicado: adjudicado,
  };
});

afterAll(async () => {
  await almacenTemporal?.borrar();
  await prisma?.$disconnect();
});

describe("el mes de julio", () => {
  test("trae una entrada de cada tipo, por fecha, con su importe, su marca de vencida y su enlace", async () => {
    const { entradas, mes } = await calendario().mes({ mes: "2031-07" });

    expect(mes).toMatchObject({
      mes: "2031-07",
      nombre: "julio de 2031",
      anterior: "2031-06",
      siguiente: "2031-08",
    });
    expect(entradas).toEqual([
      {
        tipo: "egreso",
        fecha: "2031-07-03",
        titulo: "Egreso de 100,00 del 2031-06-01",
        importe: "ARS 100,00",
        vencida: true,
        enlace: `/egresos/${ids.egresoVencido}`,
      },
      {
        tipo: "vencimiento",
        fecha: "2031-07-05",
        titulo: "Habilitación de ejemplo · SRV-2031-002",
        importe: null,
        vencida: true,
        enlace: `/servicios/${ids.servicioQueFinaliza}`,
      },
      {
        tipo: "factura",
        fecha: "2031-07-12",
        titulo: "Factura F-0001 · Minera Ejemplo S.A.",
        importe: "ARS 1.010,00",
        vencida: false,
        enlace: `/servicios/facturas/${ids.facturaConSaldo}`,
      },
      {
        tipo: "egreso",
        fecha: "2031-07-20",
        titulo: "Egreso de 300,00 del 2031-06-02",
        importe: "ARS 200,00",
        vencida: false,
        enlace: `/egresos/${ids.egresoConSaldo}`,
      },
      {
        tipo: "inicio",
        fecha: "2031-07-25",
        titulo: "Inicio de SRV-2031-003 · Servicio adjudicado de ejemplo",
        importe: null,
        vencida: false,
        enlace: `/servicios/${ids.servicioAdjudicado}`,
      },
    ]);
  });

  test("el día de hoy no está vencido y el de ayer sí", async () => {
    const { entradas } = await calendario().mes({ mes: "2031-07" });
    const venc = entradas.map(({ fecha, vencida }) => [fecha, vencida]);
    expect(venc).toContainEqual(["2031-07-05", true]);
    expect(venc).toContainEqual(["2031-07-12", false]);
  });

  test("filtra por tipo: uno o varios, y un tipo que no existe no filtra nada", async () => {
    const tipos = async (tipo: unknown) =>
      (await calendario().mes({ mes: "2031-07", tipo })).entradas.map(
        (entrada) => entrada.tipo,
      );

    expect(await tipos("inicio")).toEqual(["inicio"]);
    expect(await tipos(["factura", "egreso"])).toEqual([
      "egreso",
      "factura",
      "egreso",
    ]);
    expect(await tipos("no-es-un-tipo")).toHaveLength(5);
    expect(await tipos(undefined)).toHaveLength(5);
  });

  test("la grilla arranca el lunes: el 1 de julio, un martes, es el segundo día de la primera semana", async () => {
    const { semanas } = await calendario().mes({ mes: "2031-07" });

    expect(semanas).toHaveLength(5);
    expect(semanas.every((semana) => semana.length === 7)).toBe(true);
    expect(semanas[0]?.map((dia) => dia?.dia ?? null)).toEqual([
      null,
      1,
      2,
      3,
      4,
      5,
      6,
    ]);
    expect(semanas[4]?.map((dia) => dia?.dia ?? null)).toEqual([
      28,
      29,
      30,
      31,
      null,
      null,
      null,
    ]);
    const dia12 = semanas[1]?.[5];
    expect(dia12?.fecha).toBe("2031-07-12");
    expect(dia12?.entradas.map(({ tipo }) => tipo)).toEqual(["factura"]);
  });
});

describe("otros meses", () => {
  test("agosto trae lo suyo y nada de julio", async () => {
    const { entradas } = await calendario().mes({ mes: "2031-08" });

    expect(entradas.map(({ tipo, fecha }) => [tipo, fecha])).toEqual([
      ["factura", "2031-08-10"],
      ["vencimiento", "2031-08-14"],
    ]);
  });

  test("sin mes, o con uno ilegible, es el del reloj", async () => {
    expect((await calendario().mes({})).mes.mes).toBe("2031-07");
    expect((await calendario().mes({ mes: "mañana" })).mes.mes).toBe("2031-07");
  });
});

describe("los avisos del inicio", () => {
  const conDias = async (dias: string) => {
    await cliente().configuracion.upsert({
      where: { clave: "calendario.dias_de_aviso" },
      update: { valor: dias },
      create: { clave: "calendario.dias_de_aviso", valor: dias },
    });
    return calendario().avisos();
  };

  test("cuenta lo que vence entre hoy y hoy más N días, y lo vencido de cualquier mes", async () => {
    // Próximos: la factura del 12, el egreso del 20 y el inicio del 25. Vencidos:
    // los del 3 y el 5 de julio y el del 10 de junio.
    expect(await conDias("30")).toEqual({
      dias: 30,
      proximos: 3,
      vencidos: 3,
      enlace: "/calendario?mes=2031-07",
    });
  });

  test("N sale de la configuración y el día N entra: hoy más 3 días es el 12", async () => {
    expect((await conDias("3")).proximos).toBe(1);
    expect((await conDias("2")).proximos).toBe(0);
    expect((await conDias("60")).proximos).toBe(5);
  });

  test("una cantidad de días que no sirve es un error de infraestructura", async () => {
    for (const dias of ["0", "treinta", "-5", "1,5"]) {
      await expect(conDias(dias)).rejects.toMatchObject({
        codigo: "INF-0001",
      });
    }
  });
});
