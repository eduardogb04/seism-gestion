/**
 * Órdenes de compra y facturas de un servicio (F2-06, ADR 0036) contra el
 * Postgres de verdad del arnés y un almacén en disco: la orden que adjudica el
 * servicio, el documento opcional, la factura con su IVA calculado y nunca
 * guardado, el número único entre las vigentes, la orden elegida que tiene que
 * ser de este servicio, el saldo por facturar sin IVA (que puede quedar
 * negativo), la factura en otra moneda que no suma y la anulación.
 *
 * Datos inventados. Necesita Docker corriendo.
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
import type { ArchivoSubido } from "../../src/casos-uso/documentos/documentos.ts";
import { crearCasosUsoFacturas } from "../../src/casos-uso/servicios/facturas.ts";
import { crearCasosUsoOrdenesDeCompra } from "../../src/casos-uso/servicios/ordenes-de-compra.ts";
import { crearCasosUsoServicios } from "../../src/casos-uso/servicios/servicios.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  OPERADOR,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { altaDeServicio, sembrarServicio } from "./_arnes/servicio.ts";

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

const PDF = new TextEncoder().encode("%PDF-1.4\nDocumento de ejemplo\n");

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
const almacenes: AlmacenTemporal[] = [];
let almacen: AlmacenDocumentos;
let usuarios: readonly UsuarioSembrado[];
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

function ordenes() {
  return crearCasosUsoOrdenesDeCompra({
    ...dependencias(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  });
}

function facturas() {
  return crearCasosUsoFacturas({
    ...dependencias(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  });
}

function persona(indice: number): Actor {
  const usuario = usuarios[indice];
  if (usuario === undefined) {
    throw new Error(`no se sembró el usuario ${indice}`);
  }
  return { tipo: "persona", usuarioId: usuario.id };
}

function archivo(nombre = "documento.pdf"): ArchivoSubido {
  return { nombre, bytes: PDF };
}

function escritoDeOrden(cambios: Escrito = {}): Escrito {
  return {
    numero: "OC-0001",
    fecha: "2031-07-01",
    importe: "1.000,00",
    importeMoneda: "ARS",
    observaciones: "",
    ...cambios,
  };
}

function escritoDeFactura(cambios: Escrito = {}): Escrito {
  return {
    numero: "0000-0001",
    fecha: "2031-07-08",
    vencimiento: "2031-08-08",
    importe: "400,00",
    importeMoneda: "ARS",
    alicuota: "210",
    ordenCompraId: "",
    ...cambios,
  };
}

async function cargarOrden(
  cambios: Escrito = {},
  adjunto: ArchivoSubido | null = null,
  paraServicio = servicioId,
): Promise<string> {
  const resultado = await ordenes().crear(
    admin,
    paraServicio,
    escritoDeOrden(cambios),
    adjunto,
  );
  if (!resultado.ok) {
    throw new Error(`la orden no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.id;
}

async function cargarFactura(
  cambios: Escrito = {},
  adjunto: ArchivoSubido | null = null,
  paraServicio = servicioId,
): Promise<string> {
  const resultado = await facturas().crear(
    admin,
    paraServicio,
    escritoDeFactura(cambios),
    adjunto,
  );
  if (!resultado.ok) {
    throw new Error(`la factura no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.id;
}

async function erroresDeFactura(
  cambios: Escrito,
  adjunto: ArchivoSubido | null = null,
) {
  const resultado = await facturas().crear(
    admin,
    servicioId,
    escritoDeFactura(cambios),
    adjunto,
  );
  return resultado.ok ? {} : resultado.errores;
}

async function estado(id = servicioId): Promise<string | undefined> {
  const [ultimo] = await cliente().servicioEvento.findMany({
    where: { servicioId: id },
    orderBy: { posicion: "desc" },
    take: 1,
  });
  return ultimo?.a;
}

async function cotizado(): Promise<void> {
  await crearCasosUsoServicios(dependencias()).cambiarEstado(
    admin,
    servicioId,
    "cotizado",
    "",
  );
}

async function filas() {
  return {
    ordenes: await cliente().ordenCompra.count(),
    facturas: await cliente().factura.count(),
    documentos: await cliente().documento.count(),
    eventos: await cliente().servicioEvento.count(),
    auditoria: await cliente().auditoria.count(),
  };
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
  await Promise.all(almacenes.map((usado) => usado.borrar()));
});

beforeEach(async () => {
  await limpiarBase();
  const temporal = await crearAlmacenTemporal();
  almacenes.push(temporal);
  ({ almacen } = temporal);
  usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO, OPERADOR, EX_ADMIN]);
  admin = persona(0);
  operador = persona(1);
  exAdmin = persona(2);
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    usuarios[0]?.id ?? "",
  );
});

describe("cargar una orden de compra", () => {
  test("guarda la cabecera sin IVA, con su auditoría, y el documento es opcional", async () => {
    const id = await cargarOrden({ observaciones: "Sin observaciones" });

    const orden = await cliente().ordenCompra.findUniqueOrThrow({
      where: { id },
    });
    expect(orden).toMatchObject({
      servicioId,
      numero: "OC-0001",
      fecha: new Date("2031-07-01T00:00:00.000Z"),
      importeCentavos: 100_000n,
      importeMoneda: "ARS",
      observaciones: "Sin observaciones",
      documentoId: null,
      creadoPor: admin,
    });
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "OrdenCompra" },
    });
    expect(auditoria.map(({ accion }) => accion)).toEqual(["crear"]);
    expect(await cliente().documento.count()).toBe(0);
  });

  test("con documento: guarda el archivo en el almacén y lo enlaza", async () => {
    const id = await cargarOrden({}, archivo("orden.pdf"));

    const orden = await cliente().ordenCompra.findUniqueOrThrow({
      where: { id },
    });
    const documento = await cliente().documento.findUniqueOrThrow({
      where: { id: orden.documentoId ?? "" },
    });
    expect(documento).toMatchObject({
      nombre: "orden.pdf",
      tipoMime: "application/pdf",
    });
    const guardado = await almacen.leer(
      documento.referencia as Parameters<AlmacenDocumentos["leer"]>[0],
    );
    expect(Buffer.from(guardado).equals(Buffer.from(PDF))).toBe(true);
  });

  test("la primera pasa el servicio de cotizado a adjudicado, con su nota, en la misma transacción", async () => {
    await cotizado();
    expect(await estado()).toBe("cotizado");

    await cargarOrden({ numero: "OC-77" });

    expect(await estado()).toBe("adjudicado");
    const eventos = await cliente().servicioEvento.findMany({
      where: { servicioId },
      orderBy: { posicion: "asc" },
    });
    expect(eventos.at(-1)).toMatchObject({
      de: "cotizado",
      a: "adjudicado",
      nota: "Orden de compra OC-77 cargada",
    });
  });

  test("una segunda no cambia el estado; y en un estado que no admite adjudicar, se guarda y el estado queda como estaba", async () => {
    expect(await estado()).toBe("solicitado");
    await cargarOrden();
    expect(await estado()).toBe("solicitado");

    await cotizado();
    await cargarOrden({ numero: "OC-2" });
    expect(await estado()).toBe("adjudicado");
    const antes = await filas();
    await cargarOrden({ numero: "OC-3" });

    expect(await estado()).toBe("adjudicado");
    expect((await filas()).eventos).toBe(antes.eventos);
    expect(await cliente().ordenCompra.count()).toBe(3);
  });

  test("lo que se escribe mal vuelve por campo y no se escribe nada", async () => {
    const antes = await filas();
    const errores = async (
      cambios: Escrito,
      adjunto: ArchivoSubido | null = null,
    ) => {
      const r = await ordenes().crear(
        admin,
        servicioId,
        escritoDeOrden(cambios),
        adjunto,
      );
      return r.ok ? {} : r.errores;
    };

    expect(await errores({ numero: "  " })).toHaveProperty("numero");
    expect(await errores({ fecha: "2031-02-30" })).toHaveProperty("fecha");
    expect(await errores({ importe: "0" })).toHaveProperty("importe");
    expect(await errores({ importe: "-5,00" })).toHaveProperty("importe");
    expect(await errores({ importe: "abc" })).toHaveProperty("importe");
    expect(await errores({ importeMoneda: "EUR" })).toHaveProperty("importe");
    expect(await errores({ observaciones: "x".repeat(2001) })).toHaveProperty(
      "observaciones",
    );
    expect(
      await errores({}, { nombre: "virus.exe", bytes: PDF }),
    ).toHaveProperty("archivo");
    expect(await filas()).toEqual(antes);
  });

  test("un operador carga; quien no es administrador ni operador activo, no; un servicio que no existe es DOM-0009", async () => {
    const resultado = await ordenes().crear(
      operador,
      servicioId,
      escritoDeOrden(),
      null,
    );
    expect(resultado.ok).toBe(true);
    await expect(
      ordenes().crear(exAdmin, servicioId, escritoDeOrden(), null),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
    await expect(
      ordenes().crear(
        admin,
        "00000000-0000-4000-8000-000000000000",
        escritoDeOrden(),
        null,
      ),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    expect(await cliente().ordenCompra.count()).toBe(1);
  });

  test("el formulario trae la fecha de hoy", async () => {
    const { escrito, campos } = await ordenes().formulario(servicioId);
    expect(escrito).toEqual({ fecha: "2031-07-09" });
    expect(campos.map(([nombre]) => nombre)).toEqual([
      "numero",
      "fecha",
      "importe",
      "observaciones",
    ]);
  });
});

describe("cargar una factura", () => {
  test("guarda el importe sin IVA y la alícuota en milésimas; el IVA y el total no se guardan", async () => {
    const id = await cargarFactura({ alicuota: "105", importe: "1.000,00" });

    const fila = await cliente().factura.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({
      servicioId,
      ordenCompraId: null,
      numero: "0000-0001",
      fecha: new Date("2031-07-08T00:00:00.000Z"),
      vencimiento: new Date("2031-08-08T00:00:00.000Z"),
      importeCentavos: 100_000n,
      importeMoneda: "ARS",
      alicuotaIva: 105,
      documentoId: null,
      creadoPor: admin,
    });
    expect(
      Object.keys(fila).filter((clave) => /iva|total/i.test(clave)),
    ).toEqual(["alicuotaIva"]);
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "Factura" },
    });
    expect(auditoria.map(({ accion }) => accion)).toEqual(["crear"]);
  });

  test("el listado muestra el importe sin IVA, la alícuota, el IVA y el total, calculados con el redondeo del dominio", async () => {
    await cargarFactura({ numero: "0000-0001", importe: "400,00" });
    await cargarFactura({
      numero: "0000-0002",
      importe: "0,05",
      alicuota: "105",
      fecha: "2031-07-09",
    });
    await cargarFactura({
      numero: "0000-0003",
      importe: "10,00",
      alicuota: "0",
      importeMoneda: "USD",
      fecha: "2031-07-07",
    });

    const listado = await facturas().listar(servicioId);

    expect(
      listado.map(({ numero, sinIva, alicuota, iva, total }) => [
        numero,
        sinIva,
        alicuota,
        iva,
        total,
      ]),
    ).toEqual([
      ["0000-0002", "ARS 0,05", "10,5 %", "ARS 0,01", "ARS 0,06"],
      ["0000-0001", "ARS 400,00", "21 %", "ARS 84,00", "ARS 484,00"],
      ["0000-0003", "USD 10,00", "0 %", "USD 0,00", "USD 10,00"],
    ]);
    expect(listado[0]).toMatchObject({
      fecha: "09/07/2031",
      vencimiento: "08/08/2031",
      ordenCompra: "",
      documento: null,
      quien: "admin.a@ejemplo.test",
    });
  });

  test("el número no se repite entre las vigentes, sin distinguir mayúsculas ni espacios; anulada la primera, se puede volver a usar", async () => {
    const primera = await cargarFactura({ numero: "A-0001" });
    const antes = await filas();

    expect(await erroresDeFactura({ numero: " a-0001 " })).toHaveProperty(
      "numero",
    );
    expect(await filas()).toEqual(antes);

    await facturas().marcarEliminado(admin, primera);
    await cargarFactura({ numero: "A-0001" });
    expect(await cliente().factura.count()).toBe(2);
  });

  test("dos altas a la vez con el mismo número: entra una; la otra vuelve con el mensaje en el campo o se rechaza con DOM-0008, nunca un error crudo", async () => {
    const resultados = await Promise.allSettled([
      facturas().crear(admin, servicioId, escritoDeFactura(), null),
      facturas().crear(admin, servicioId, escritoDeFactura(), null),
    ]);

    const entradas = resultados.filter(
      (r) => r.status === "fulfilled" && r.value.ok,
    );
    expect(entradas).toHaveLength(1);
    const otra = resultados.find((r) => !entradas.includes(r));
    expect([
      otra?.status === "fulfilled" ? "numero" : undefined,
      otra?.status === "rejected" ? otra.reason?.codigo : undefined,
    ]).toContainEqual(expect.stringMatching(/^(numero|DOM-0008)$/));
    expect(await cliente().factura.count()).toBe(1);
  });

  test("el índice único de la base rechaza el número repetido aunque el caso de uso no lo haya visto: DOM-0008", async () => {
    await cargarFactura({ numero: "B-0001" });

    const repetida = crearTransaccionalPrisma(cliente()).ejecutar(
      async (repos) => {
        const [existente] = await repos.facturas.listarDe(servicioId);
        if (existente === undefined) {
          throw new Error("no hay factura");
        }
        await repos.facturas.crear(admin, {
          ...existente,
          valor: {
            ...existente.valor,
            id: identificadorDesde<string>(
              "11111111-1111-4111-8111-111111111111",
            ),
          },
        });
      },
    );

    await expect(repetida).rejects.toMatchObject({
      codigo: catalogo.DOM_0008.codigo,
    });
    expect(await cliente().factura.count()).toBe(1);
  });

  test("el vencimiento es obligatorio y no puede ser anterior a la fecha; el mismo día vale", async () => {
    expect(await erroresDeFactura({ vencimiento: "" })).toHaveProperty(
      "vencimiento",
    );
    expect(
      await erroresDeFactura({
        fecha: "2031-07-08",
        vencimiento: "2031-07-07",
      }),
    ).toHaveProperty("vencimiento");
    expect(
      await erroresDeFactura({ vencimiento: "2031-02-30" }),
    ).toHaveProperty("vencimiento");
    expect(
      await erroresDeFactura({
        fecha: "2031-07-08",
        vencimiento: "2031-07-08",
      }),
    ).toEqual({});
  });

  test("lo demás que se escribe mal vuelve por campo y no se escribe nada", async () => {
    const antes = await filas();

    expect(await erroresDeFactura({ numero: "" })).toHaveProperty("numero");
    expect(await erroresDeFactura({ importe: "0,00" })).toHaveProperty(
      "importe",
    );
    expect(await erroresDeFactura({ alicuota: "270" })).toHaveProperty(
      "alicuota",
    );
    expect(await erroresDeFactura({ alicuota: "" })).toHaveProperty("alicuota");
    expect(
      await erroresDeFactura({}, { nombre: "virus.exe", bytes: PDF }),
    ).toHaveProperty("archivo");
    expect(await filas()).toEqual(antes);
  });

  test("la orden de compra es opcional y tiene que ser una vigente de este servicio", async () => {
    const otroServicio = await altaDeServicio(
      cliente(),
      dependencias(),
      admin,
      usuarios[0]?.id ?? "",
      "Otro servicio de ejemplo",
    );
    const propia = await cargarOrden({ numero: "OC-propia" });
    const ajena = await cargarOrden({ numero: "OC-ajena" }, null, otroServicio);
    const anulada = await cargarOrden({ numero: "OC-anulada" });
    await ordenes().marcarEliminado(admin, anulada);

    expect(await erroresDeFactura({ ordenCompraId: ajena })).toHaveProperty(
      "ordenCompraId",
    );
    expect(await erroresDeFactura({ ordenCompraId: anulada })).toHaveProperty(
      "ordenCompraId",
    );
    expect(
      await erroresDeFactura({
        ordenCompraId: "00000000-0000-4000-8000-000000000000",
      }),
    ).toHaveProperty("ordenCompraId");
    expect(
      await erroresDeFactura({ ordenCompraId: "no-es-un-id" }),
    ).toHaveProperty("ordenCompraId");

    const conOrden = await cargarFactura({
      numero: "0000-0010",
      ordenCompraId: propia,
    });
    const sinOrden = await cargarFactura({ numero: "0000-0011" });
    const filasDeFactura = await cliente().factura.findMany({
      where: { id: { in: [conOrden, sinOrden] } },
    });
    expect(
      Object.fromEntries(
        filasDeFactura.map(({ id, ordenCompraId }) => [id, ordenCompraId]),
      ),
    ).toEqual({ [conOrden]: propia, [sinOrden]: null });
    const listada = await facturas().listar(servicioId);
    expect(listada.find(({ id }) => id === conOrden)?.ordenCompra).toBe(
      "OC-propia",
    );
  });

  test("el documento es opcional; con uno, se guarda y se enlaza", async () => {
    const id = await cargarFactura({}, archivo("factura.pdf"));

    const fila = await cliente().factura.findUniqueOrThrow({ where: { id } });
    const documento = await cliente().documento.findUniqueOrThrow({
      where: { id: fila.documentoId ?? "" },
    });
    expect(documento.nombre).toBe("factura.pdf");
    expect((await facturas().listar(servicioId))[0]?.documento).toMatchObject({
      id: documento.id,
      nombre: "factura.pdf",
    });
  });

  test("el formulario ofrece las órdenes vigentes del servicio, el 21 % por defecto y la moneda de la última orden", async () => {
    await cargarOrden({ numero: "OC-vieja", fecha: "2031-06-01" });
    await cargarOrden({
      numero: "OC-nueva",
      fecha: "2031-07-01",
      importeMoneda: "USD",
    });
    const anulada = await cargarOrden({ numero: "OC-anulada" });
    await ordenes().marcarEliminado(admin, anulada);

    const { campos, escrito } = await facturas().formulario(servicioId);

    expect(escrito).toEqual({
      fecha: "2031-07-09",
      alicuota: "210",
      importeMoneda: "USD",
    });
    const orden = campos.find(([nombre]) => nombre === "ordenCompraId")?.[1];
    expect(orden).toMatchObject({ tipo: "opcion", opcional: true });
    expect(
      orden?.tipo === "opcion" ? orden.opciones.map((o) => o.etiqueta) : [],
    ).toEqual(["OC-nueva · USD 1.000,00", "OC-vieja · ARS 1.000,00"]);
    const alicuotas = campos.find(([nombre]) => nombre === "alicuota")?.[1];
    expect(
      alicuotas?.tipo === "opcion"
        ? alicuotas.opciones.map((o) => [o.valor, o.etiqueta])
        : [],
    ).toEqual([
      ["210", "21 %"],
      ["105", "10,5 %"],
      ["0", "0 %"],
    ]);
  });

  test("sin ninguna orden de compra, el formulario propone pesos y no ofrece órdenes", async () => {
    const { campos, escrito } = await facturas().formulario(servicioId);

    expect(escrito).toMatchObject({ importeMoneda: "ARS" });
    const orden = campos.find(([nombre]) => nombre === "ordenCompraId")?.[1];
    expect(orden?.tipo === "opcion" ? orden.opciones : undefined).toEqual([]);
  });

  test("quien no es administrador ni operador activo no carga; un servicio que no existe es DOM-0009", async () => {
    await expect(
      facturas().crear(exAdmin, servicioId, escritoDeFactura(), null),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
    await expect(
      facturas().crear(
        admin,
        "00000000-0000-4000-8000-000000000000",
        escritoDeFactura(),
        null,
      ),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    expect(await cliente().factura.count()).toBe(0);
  });
});

describe("el saldo por facturar de una orden de compra, sin IVA", () => {
  test("dos facturas parciales: total, facturado y saldo", async () => {
    const orden = await cargarOrden({ importe: "1.000,00" });
    await cargarFactura({
      numero: "0000-0001",
      importe: "400,00",
      alicuota: "210",
      ordenCompraId: orden,
    });
    await cargarFactura({
      numero: "0000-0002",
      importe: "250,00",
      alicuota: "105",
      ordenCompraId: orden,
    });

    const [listada] = await ordenes().listar(servicioId);

    expect(listada).toMatchObject({
      numero: "OC-0001",
      total: "ARS 1.000,00",
      facturado: "ARS 650,00",
      saldo: "ARS 350,00",
      aviso: null,
      otraMoneda: [],
    });
  });

  test("facturar de más se guarda y la orden muestra un aviso, con el saldo negativo", async () => {
    const orden = await cargarOrden({ importe: "1.000,00" });
    await cargarFactura({ importe: "900,00", ordenCompraId: orden });

    const excedida = await facturas().crear(
      admin,
      servicioId,
      escritoDeFactura({
        numero: "0000-0002",
        importe: "300,00",
        ordenCompraId: orden,
      }),
      null,
    );

    expect(excedida.ok).toBe(true);
    const [listada] = await ordenes().listar(servicioId);
    expect(listada).toMatchObject({
      facturado: "ARS 1.200,00",
      saldo: "ARS -200,00",
      aviso: "Se facturó ARS 200,00 más que la orden de compra",
    });
  });

  test("una factura en otra moneda no suma: se muestra aparte y no se convierte nada", async () => {
    const orden = await cargarOrden({ importe: "1.000,00" });
    await cargarFactura({ importe: "100,00", ordenCompraId: orden });
    await cargarFactura({
      numero: "0000-0002",
      importe: "5.000,00",
      importeMoneda: "USD",
      ordenCompraId: orden,
    });

    const [listada] = await ordenes().listar(servicioId);

    expect(listada).toMatchObject({
      facturado: "ARS 100,00",
      saldo: "ARS 900,00",
      aviso: null,
      otraMoneda: ["0000-0002 · USD 5.000,00"],
    });
  });

  test("las facturas sin orden y las anuladas no cuentan; las de otra orden, tampoco", async () => {
    const primera = await cargarOrden({ numero: "OC-1", importe: "1.000,00" });
    const segunda = await cargarOrden({
      numero: "OC-2",
      importe: "500,00",
      fecha: "2031-07-02",
    });
    await cargarFactura({ numero: "F-sin", importe: "70,00" });
    const anulada = await cargarFactura({
      numero: "F-anulada",
      importe: "80,00",
      ordenCompraId: primera,
    });
    await facturas().marcarEliminado(admin, anulada);
    await cargarFactura({
      numero: "F-de-la-segunda",
      importe: "90,00",
      ordenCompraId: segunda,
    });

    const listadas = await ordenes().listar(servicioId);

    expect(
      listadas.map(({ numero, facturado, saldo }) => [
        numero,
        facturado,
        saldo,
      ]),
    ).toEqual([
      ["OC-2", "ARS 90,00", "ARS 410,00"],
      ["OC-1", "ARS 0,00", "ARS 1.000,00"],
    ]);
  });
});

describe("anular", () => {
  test("una orden sin facturas sale del listado y deja su documento dado de baja; el estado no vuelve atrás", async () => {
    await cotizado();
    const id = await cargarOrden({}, archivo());
    const orden = await cliente().ordenCompra.findUniqueOrThrow({
      where: { id },
    });

    await ordenes().marcarEliminado(operador, id);

    expect(await ordenes().listar(servicioId)).toEqual([]);
    const anulada = await cliente().ordenCompra.findUniqueOrThrow({
      where: { id },
    });
    expect(anulada.eliminadoPor).toEqual(operador);
    const documento = await cliente().documento.findUniqueOrThrow({
      where: { id: orden.documentoId ?? "" },
    });
    expect(documento.eliminadoEn).not.toBeNull();
    expect(await estado()).toBe("adjudicado");
  });

  test("una orden con facturas vigentes no se anula (DOM-0014) y no se escribe nada; sin ellas, sí", async () => {
    const orden = await cargarOrden();
    const factura = await cargarFactura({ ordenCompraId: orden });
    const antes = await filas();

    await expect(ordenes().marcarEliminado(admin, orden)).rejects.toMatchObject(
      {
        codigo: catalogo.DOM_0014.codigo,
      },
    );
    expect(await filas()).toEqual(antes);

    await facturas().marcarEliminado(admin, factura);
    await ordenes().marcarEliminado(admin, orden);
    expect(await ordenes().listar(servicioId)).toEqual([]);
  });

  test("una factura sale del listado, con su documento, y el número queda libre", async () => {
    const id = await cargarFactura({}, archivo());

    await facturas().marcarEliminado(admin, id);

    expect(await facturas().listar(servicioId)).toEqual([]);
    expect(
      await cliente().documento.count({ where: { eliminadoEn: null } }),
    ).toBe(0);
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "Factura" },
      orderBy: { en: "asc" },
    });
    expect(auditoria.map(({ accion }) => accion)).toEqual([
      "crear",
      "eliminar",
    ]);
  });

  test("lo que no existe o ya está anulado es DOM-0009; quien no puede escribir, AUT-0009", async () => {
    const orden = await cargarOrden();
    const factura = await cargarFactura();
    await ordenes().marcarEliminado(admin, orden);
    await facturas().marcarEliminado(admin, factura);

    for (const id of [
      orden,
      "no-es-un-id",
      "00000000-0000-4000-8000-000000000000",
    ]) {
      await expect(ordenes().marcarEliminado(admin, id)).rejects.toMatchObject({
        codigo: catalogo.DOM_0009.codigo,
      });
    }
    for (const id of [factura, "no-es-un-id"]) {
      await expect(facturas().marcarEliminado(admin, id)).rejects.toMatchObject(
        {
          codigo: catalogo.DOM_0009.codigo,
        },
      );
    }
    await expect(
      ordenes().marcarEliminado(exAdmin, orden),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
    await expect(
      facturas().marcarEliminado(exAdmin, factura),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
  });
});

describe("el servicio que tiene órdenes de compra o facturas", () => {
  test("no se da de baja con una factura vigente (aunque siga en «Solicitado»), con una orden vigente, y sí cuando ya no tiene ninguna", async () => {
    const baja = () =>
      crearCasosUsoServicios(dependencias()).marcarEliminado(admin, servicioId);
    const factura = await cargarFactura();
    const orden = await cargarOrden();
    expect(await estado()).toBe("solicitado");

    await expect(baja()).rejects.toMatchObject({
      codigo: catalogo.DOM_0010.codigo,
    });
    await facturas().marcarEliminado(admin, factura);
    await expect(baja()).rejects.toMatchObject({
      codigo: catalogo.DOM_0010.codigo,
    });
    await ordenes().marcarEliminado(admin, orden);

    await baja();
    expect(
      (
        await cliente().servicio.findUniqueOrThrow({
          where: { id: servicioId },
        })
      ).eliminadoEn,
    ).not.toBeNull();
  });

  test("con solo una factura sin orden en «Solicitado» no se da de baja (DOM-0010); anulada la factura, sí", async () => {
    const baja = () =>
      crearCasosUsoServicios(dependencias()).marcarEliminado(admin, servicioId);
    const factura = await cargarFactura();
    expect(await estado()).toBe("solicitado");
    expect(await cliente().ordenCompra.count()).toBe(0);

    await expect(baja()).rejects.toMatchObject({
      codigo: catalogo.DOM_0010.codigo,
    });
    await facturas().marcarEliminado(admin, factura);

    await baja();
    expect(
      (
        await cliente().servicio.findUniqueOrThrow({
          where: { id: servicioId },
        })
      ).eliminadoEn,
    ).not.toBeNull();
  });
});

describe("anular una orden y cargar una factura de esa orden a la vez", () => {
  test("nunca queda una factura vigente apuntando a una orden anulada", async () => {
    for (let vuelta = 0; vuelta < 12; vuelta++) {
      const orden = await cargarOrden({ numero: `OC-carrera-${vuelta}` });

      const [anulada, cargada] = await Promise.allSettled([
        ordenes().marcarEliminado(admin, orden),
        facturas().crear(
          admin,
          servicioId,
          escritoDeFactura({
            numero: `0000-carrera-${vuelta}`,
            ordenCompraId: orden,
          }),
          null,
        ),
      ]);

      const huerfanas = await cliente().factura.count({
        where: {
          eliminadoEn: null,
          ordenCompra: { eliminadoEn: { not: null } },
        },
      });
      expect(huerfanas, `vuelta ${vuelta}`).toBe(0);
      // Una de las dos gana: o se anuló la orden y la factura volvió con su mensaje, o se facturó y la orden no se anuló (DOM-0014).
      const seAnulo = anulada.status === "fulfilled";
      const seFacturo = cargada.status === "fulfilled" && cargada.value.ok;
      expect(seAnulo !== seFacturo, `vuelta ${vuelta}`).toBe(true);
    }
  });
});

describe("el orden del listado con la misma fecha (M-12)", () => {
  // Con la misma fecha y el mismo `creado_en` (el reloj es fijo), el único
  // desempate es el que pone el adaptador. Se actualiza la fila que tiene que
  // salir primera para que quede al final en el heap: sin desempate, Postgres
  // devuelve el orden físico y el test falla siempre, no a veces.
  test("las facturas del mismo día salen por número, de mayor a menor", async () => {
    await cargarFactura({ numero: "0000-0001" });
    const segunda = await cargarFactura({ numero: "0000-0002" });
    await cliente().factura.update({
      where: { id: segunda },
      data: { actualizadoEn: new Date("2031-07-09T11:00:00Z") },
    });

    const listado = await facturas().listar(servicioId);

    expect(listado.map(({ numero }) => numero)).toEqual([
      "0000-0002",
      "0000-0001",
    ]);
  });

  test("las órdenes de compra del mismo día salen por id, de mayor a menor", async () => {
    const primera = await cargarOrden({ numero: "OC-0001" });
    const segunda = await cargarOrden({ numero: "OC-0002" });
    const [mayor, menor] =
      primera > segunda ? [primera, segunda] : [segunda, primera];
    await cliente().ordenCompra.update({
      where: { id: mayor },
      data: { actualizadoEn: new Date("2031-07-09T11:00:00Z") },
    });

    const listado = await ordenes().listar(servicioId);

    expect(listado.map(({ id }) => id)).toEqual([mayor, menor]);
  });
});
