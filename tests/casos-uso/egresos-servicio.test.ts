/**
 * Un egreso imputado a un servicio y con su comprobante (F2-08): la regla
 * cruzada (un centro de clase proyecto exige servicio; los demás, ninguno), en
 * el alta y en la edición; el comprobante adjunto; y la baja del servicio, que
 * no se puede si tiene egresos vigentes. Contra el Postgres del arnés. Datos
 * inventados.
 */

import { readdir } from "node:fs/promises";
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
import { CENTROS_DE_COSTO } from "../../src/casos-uso/abm/centros-de-costo.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { EGRESOS } from "../../src/casos-uso/abm/egresos.ts";
import type { ArchivoSubido } from "../../src/casos-uso/documentos/documentos.ts";
import { crearCasosUsoPagos } from "../../src/casos-uso/egresos/pagos.ts";
import { crearCasosUsoEgresosDeServicio } from "../../src/casos-uso/servicios/egresos.ts";
import { crearCasosUsoServicios } from "../../src/casos-uso/servicios/servicios.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
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

const PDF = new TextEncoder().encode("%PDF-1.4\nFactura de ejemplo\n");
const OTRO_PDF = new TextEncoder().encode(
  "%PDF-1.4\nOtra factura de ejemplo\n",
);

const FALTA_SERVICIO =
  "Un egreso de un centro de costo de proyecto tiene que decir de qué servicio es";
const SOBRA_SERVICIO =
  "Solo los egresos de centros de costo de proyecto llevan servicio";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
const almacenes: AlmacenTemporal[] = [];
let almacen: AlmacenDocumentos;
let carpeta: string;
let admin: Actor;
let servicioId: string;
let proyecto: string;
let administracion: string;

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

function casos() {
  return crearCasosUsoAbm({
    ...dependencias(),
    adjuntos: { almacen, nuevaClave: nuevaClaveDocumento },
  });
}

async function centro(nombre: string, clase: string): Promise<string> {
  const resultado = await casos().crear(admin, CENTROS_DE_COSTO, {
    nombre,
    clase,
    descripcion: "",
    activo: "si",
  });
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.registro.valor.id;
}

function escrito(centroCostoId: string, cambios: Escrito = {}): Escrito {
  return {
    fecha: "2031-07-03",
    concepto: "Repuestos",
    centroCostoId,
    proveedorId: "",
    servicioId: "",
    numeroComprobante: "",
    importe: "1.234,50",
    importeMoneda: "ARS",
    vencimiento: "",
    observaciones: "",
    ...cambios,
  };
}

function archivo(
  bytes: Uint8Array = PDF,
  nombre = "factura.pdf",
): ArchivoSubido {
  return { nombre, bytes };
}

/** Un egreso que tiene que guardarse; devuelve su id. */
async function alta(
  centroCostoId: string,
  cambios: Escrito = {},
  adjunto: ArchivoSubido | null = null,
): Promise<string> {
  const resultado = await casos().crear(
    admin,
    EGRESOS,
    escrito(centroCostoId, cambios),
    adjunto,
  );
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.registro.valor.id;
}

const cantidadDeEgresos = () => cliente().egreso.count();

async function archivosEnElAlmacen(): Promise<number> {
  const todos = await readdir(carpeta, {
    recursive: true,
    withFileTypes: true,
  });
  return todos.filter((entrada) => entrada.isFile()).length;
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
  ({ almacen, carpeta } = temporal);
  const [sembrado] = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
  if (sembrado === undefined) {
    throw new Error("falta el administrador sembrado");
  }
  admin = { tipo: "persona", usuarioId: sembrado.id };
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    sembrado.id,
  );
  proyecto = await centro("Proyecto de ejemplo", "proyecto");
  administracion = await centro("Administración", "gestion_administrativa");
});

describe("la regla cruzada entre el centro de costo y el servicio", () => {
  test("un egreso de proyecto sin servicio se rechaza al lado del campo y no se guarda", async () => {
    const resultado = await casos().crear(admin, EGRESOS, escrito(proyecto));

    expect(resultado).toEqual({
      ok: false,
      errores: { servicioId: FALTA_SERVICIO },
    });
    expect(await cantidadDeEgresos()).toBe(0);
  });

  test("un egreso de otra clase con servicio se rechaza al lado del campo y no se guarda", async () => {
    const resultado = await casos().crear(
      admin,
      EGRESOS,
      escrito(administracion, { servicioId }),
    );

    expect(resultado).toEqual({
      ok: false,
      errores: { servicioId: SOBRA_SERVICIO },
    });
    expect(await cantidadDeEgresos()).toBe(0);
  });

  test("un egreso de proyecto con servicio se guarda; uno de otra clase sin servicio, también", async () => {
    const conServicio = await alta(proyecto, { servicioId });
    const sinServicio = await alta(administracion);

    const filas = await cliente().egreso.findMany();
    expect(
      Object.fromEntries(filas.map((fila) => [fila.id, fila.servicioId])),
    ).toEqual({ [conServicio]: servicioId, [sinServicio]: null });
  });

  test("un servicio que no existe se rechaza como una opción que no es de la lista", async () => {
    const resultado = await casos().crear(
      admin,
      EGRESOS,
      escrito(proyecto, { servicioId: "00000000-0000-4000-8000-000000000000" }),
    );

    expect(resultado).toEqual({
      ok: false,
      errores: { servicioId: "Elegí una de las opciones de la lista." },
    });
  });

  test("la edición que pasa el egreso a un centro de proyecto sin servicio se rechaza y deja el egreso como estaba", async () => {
    const id = await alta(administracion);

    const resultado = await casos().guardar(
      admin,
      EGRESOS,
      id,
      escrito(proyecto),
    );

    expect(resultado).toEqual({
      ok: false,
      errores: { servicioId: FALTA_SERVICIO },
    });
    const fila = await cliente().egreso.findUniqueOrThrow({ where: { id } });
    expect([fila.centroCostoId, fila.servicioId]).toEqual([
      administracion,
      null,
    ]);
  });

  test("la edición que pasa un egreso con servicio a otra clase de centro se rechaza si no le quita el servicio", async () => {
    const id = await alta(proyecto, { servicioId });

    const rechazada = await casos().guardar(
      admin,
      EGRESOS,
      id,
      escrito(administracion, { servicioId }),
    );
    const aceptada = await casos().guardar(
      admin,
      EGRESOS,
      id,
      escrito(administracion),
    );

    expect(rechazada).toEqual({
      ok: false,
      errores: { servicioId: SOBRA_SERVICIO },
    });
    expect(aceptada.ok).toBe(true);
  });

  test("el selector ofrece los servicios por código y título", async () => {
    const servicio = await cliente().servicio.findUniqueOrThrow({
      where: { id: servicioId },
    });

    const { servicioId: opciones } = await casos().opciones(EGRESOS);

    expect(opciones).toEqual([
      { valor: servicioId, texto: `${servicio.codigo} · ${servicio.titulo}` },
    ]);
  });
});

describe("el comprobante adjunto", () => {
  test("un egreso con archivo guarda el documento y lo enlaza; sin archivo, no enlaza ninguno", async () => {
    const con = await alta(administracion, {}, archivo());
    const sin = await alta(administracion, { concepto: "Papelería" });

    const filaCon = await cliente().egreso.findUniqueOrThrow({
      where: { id: con },
      include: { comprobante: true },
    });
    const filaSin = await cliente().egreso.findUniqueOrThrow({
      where: { id: sin },
    });
    expect(filaCon.comprobante?.nombre).toBe("factura.pdf");
    expect(filaSin.comprobanteId).toBeNull();
    expect(await archivosEnElAlmacen()).toBe(1);
  });

  test("un archivo que no es de los admitidos se rechaza al lado del campo y no deja nada guardado", async () => {
    const resultado = await casos().crear(
      admin,
      EGRESOS,
      escrito(administracion),
      archivo(new TextEncoder().encode("MZ"), "factura.exe"),
    );

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && Object.keys(resultado.errores)).toEqual([
      "archivo",
    ]);
    expect(await cantidadDeEgresos()).toBe(0);
    expect(await archivosEnElAlmacen()).toBe(0);
  });

  test("con un error en otro campo, el archivo elegido tampoco se guarda", async () => {
    const resultado = await casos().crear(
      admin,
      EGRESOS,
      escrito(proyecto),
      archivo(),
    );

    expect(resultado).toEqual({
      ok: false,
      errores: { servicioId: FALTA_SERVICIO },
    });
    expect(await archivosEnElAlmacen()).toBe(0);
  });

  test("editar sin elegir archivo conserva el comprobante; elegir uno lo reemplaza aunque nada más cambie", async () => {
    const id = await alta(administracion, {}, archivo());
    const primero = (
      await cliente().egreso.findUniqueOrThrow({ where: { id } })
    ).comprobanteId;

    await casos().guardar(
      admin,
      EGRESOS,
      id,
      escrito(administracion, { concepto: "Repuestos y flete" }),
    );
    const conservado = (
      await cliente().egreso.findUniqueOrThrow({ where: { id } })
    ).comprobanteId;
    const reemplazo = await casos().guardar(
      admin,
      EGRESOS,
      id,
      escrito(administracion, { concepto: "Repuestos y flete" }),
      archivo(OTRO_PDF, "otra.pdf"),
    );
    const nuevo = await cliente().egreso.findUniqueOrThrow({
      where: { id },
      include: { comprobante: true },
    });

    expect(primero).not.toBeNull();
    expect(conservado).toBe(primero);
    expect(reemplazo.ok).toBe(true);
    expect(nuevo.comprobante?.nombre).toBe("otra.pdf");
    expect(nuevo.comprobanteId).not.toBe(primero);
  });
});

describe("la baja de un servicio con egresos", () => {
  const servicios = () => crearCasosUsoServicios(dependencias());

  test("un servicio con un egreso vigente no se da de baja y queda como estaba", async () => {
    await alta(proyecto, { servicioId });

    await expect(
      servicios().marcarEliminado(admin, servicioId),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });

    const fila = await cliente().servicio.findUniqueOrThrow({
      where: { id: servicioId },
    });
    expect(fila.eliminadoEn).toBeNull();
  });

  test("con el egreso dado de baja, el servicio sí se da de baja", async () => {
    const id = await alta(proyecto, { servicioId });
    await casos().marcarEliminado(admin, EGRESOS, id);

    await servicios().marcarEliminado(admin, servicioId);

    const fila = await cliente().servicio.findUniqueOrThrow({
      where: { id: servicioId },
    });
    expect(fila.eliminadoEn).not.toBeNull();
  });
});

describe("lo que se ve del servicio y del egreso", () => {
  test("el servicio lista sus egresos vigentes y suma un total por moneda, sin convertir", async () => {
    await alta(proyecto, { servicioId, concepto: "Repuestos" });
    await alta(proyecto, {
      servicioId,
      concepto: "Flete",
      importe: "500,50",
    });
    await alta(proyecto, {
      servicioId,
      concepto: "Licencia",
      importe: "20,00",
      importeMoneda: "USD",
    });
    const anulado = await alta(proyecto, { servicioId, concepto: "Error" });
    await casos().marcarEliminado(admin, EGRESOS, anulado);

    const { egresos, totales } = await crearCasosUsoEgresosDeServicio({
      transaccional: crearTransaccionalPrisma(cliente()),
    }).listar(servicioId);

    expect(egresos.map(({ concepto }) => concepto).sort()).toEqual([
      "Flete",
      "Licencia",
      "Repuestos",
    ]);
    expect(egresos[0]?.centroCosto).toBe("Proyecto de ejemplo");
    expect(totales).toEqual(["ARS 1.735,00", "USD 20,00"]);
  });

  test("el detalle del egreso dice su servicio y ofrece su comprobante", async () => {
    const id = await alta(proyecto, { servicioId }, archivo());
    const servicio = await cliente().servicio.findUniqueOrThrow({
      where: { id: servicioId },
    });

    const detalle = await crearCasosUsoPagos(dependencias()).detalle(id);

    expect(
      detalle.datos.find(({ etiqueta }) => etiqueta === "Servicio")?.valor,
    ).toBe(`${servicio.codigo} · ${servicio.titulo}`);
    expect(detalle.comprobante).toMatchObject({ nombre: "factura.pdf" });
  });
});
