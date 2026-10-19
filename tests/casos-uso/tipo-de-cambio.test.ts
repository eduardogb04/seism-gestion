/**
 * El tipo de cambio de la orden de compra, la factura y el egreso (F3-04),
 * contra el Postgres de verdad del arnés: obligatorio si el documento es en
 * dólares, rechazado si es en pesos, sin tipo de cambio en lo ya cargado y
 * completable después. Solo se guarda: ningún total cambia. Datos inventados.
 * Necesita Docker corriendo.
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
import { CENTROS_DE_COSTO } from "../../src/casos-uso/abm/centros-de-costo.ts";
import {
  cabecerasDe,
  type Escrito,
  escritoDe,
} from "../../src/casos-uso/abm/definicion.ts";
import { EGRESOS } from "../../src/casos-uso/abm/egresos.ts";
import { crearCasosUsoPagos } from "../../src/casos-uso/egresos/pagos.ts";
import { crearCasosUsoFacturas } from "../../src/casos-uso/servicios/facturas.ts";
import { crearCasosUsoOrdenesDeCompra } from "../../src/casos-uso/servicios/ordenes-de-compra.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import {
  conModalidad,
  llevarServicioA,
  sembrarServicio,
} from "./_arnes/servicio.ts";

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

const EN_DOLARES = { importeMoneda: "USD" };
const CON_CAMBIO = {
  cambio: "1.184,25",
  cambioFuente: "  Cotización de ejemplo  ",
};

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
const almacenes: AlmacenTemporal[] = [];
let almacen: AlmacenDocumentos;
let usuarios: readonly UsuarioSembrado[];
let admin: Actor;
let exAdmin: Actor;
let servicioId: string;
let centroId: string;

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

const ordenes = () =>
  crearCasosUsoOrdenesDeCompra({
    ...dependencias(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  });

const facturas = () =>
  crearCasosUsoFacturas({
    ...dependencias(),
    almacen,
    nuevaClave: nuevaClaveDocumento,
  });

const abm = () => crearCasosUsoAbm(dependencias());

/** Deja el servicio en la etapa donde se carga el documento que el test arma (F3-01); si ya está, no hace nada. */
async function llevarA(destino: "cotizado" | "adjudicado"): Promise<void> {
  const [ultimo] = await cliente().servicioEvento.findMany({
    where: { servicioId },
    orderBy: { posicion: "desc" },
    take: 1,
  });
  if (ultimo?.a === destino) {
    return;
  }
  await llevarServicioA(
    dependencias().transaccional,
    admin,
    servicioId,
    destino === "cotizado" ? ["cotizado"] : ["cotizado", "adjudicado"],
    HOY,
  );
}

function persona(indice: number): Actor {
  const usuario = usuarios[indice];
  if (usuario === undefined) {
    throw new Error(`no se sembró el usuario ${indice}`);
  }
  return { tipo: "persona", usuarioId: usuario.id };
}

type Resultado =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly errores: Readonly<Record<string, string>> };

type Documento = {
  readonly nombre: string;
  crear(escrito: Escrito): Promise<Resultado>;
  escritoBase(cambios: Escrito): Escrito;
  cantidad(): Promise<number>;
  /** Las tres columnas del tipo de cambio de la única fila. */
  columnas(): Promise<readonly [bigint | null, bigint | null, string | null]>;
  /** Deja el documento como estaba antes de esta tarea: sin tipo de cambio. */
  sinCambio(id: string): Promise<void>;
};

const SIN_COLUMNAS = {
  cambioNumerador: null,
  cambioDenominador: null,
  cambioFuente: null,
};

const documentos: readonly Documento[] = [
  {
    nombre: "orden de compra",
    crear: async (escrito) => {
      await llevarA("cotizado");
      return ordenes().crear(admin, servicioId, escrito, null);
    },
    escritoBase: (cambios) => ({
      numero: "OC-0001",
      fecha: "2031-07-01",
      importe: "1.000,00",
      importeMoneda: "ARS",
      observaciones: "",
      ...cambios,
    }),
    cantidad: () => cliente().ordenCompra.count(),
    columnas: async () => {
      const f = await cliente().ordenCompra.findFirstOrThrow();
      return [f.cambioNumerador, f.cambioDenominador, f.cambioFuente];
    },
    sinCambio: async (id) => {
      await cliente().ordenCompra.update({ where: { id }, data: SIN_COLUMNAS });
    },
  },
  {
    nombre: "factura",
    crear: async (escrito) => {
      await llevarA("adjudicado");
      return facturas().crear(admin, servicioId, escrito, null);
    },
    escritoBase: (cambios) => ({
      numero: "0000-0001",
      fecha: "2031-07-08",
      vencimiento: "2031-08-08",
      importe: "400,00",
      importeMoneda: "ARS",
      alicuota: "210",
      ordenCompraId: "",
      ...cambios,
    }),
    cantidad: () => cliente().factura.count(),
    columnas: async () => {
      const f = await cliente().factura.findFirstOrThrow();
      return [f.cambioNumerador, f.cambioDenominador, f.cambioFuente];
    },
    sinCambio: async (id) => {
      await cliente().factura.update({ where: { id }, data: SIN_COLUMNAS });
    },
  },
  {
    nombre: "egreso",
    crear: async (escrito) => {
      const resultado = await abm().crear(admin, EGRESOS, escrito);
      return resultado.ok
        ? { ok: true, id: resultado.registro.valor.id }
        : resultado;
    },
    escritoBase: (cambios) => ({
      fecha: "2031-07-03",
      concepto: "Combustible",
      centroCostoId: centroId,
      servicioId: "",
      proveedorId: "",
      numeroComprobante: "",
      importe: "1.234,50",
      importeMoneda: "ARS",
      vencimiento: "",
      observaciones: "",
      ...cambios,
    }),
    cantidad: () => cliente().egreso.count(),
    columnas: async () => {
      const f = await cliente().egreso.findFirstOrThrow();
      return [f.cambioNumerador, f.cambioDenominador, f.cambioFuente];
    },
    sinCambio: async (id) => {
      await cliente().egreso.update({ where: { id }, data: SIN_COLUMNAS });
    },
  },
];

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
  usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO, EX_ADMIN]);
  admin = persona(0);
  exAdmin = persona(1);
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    usuarios[0]?.id ?? "",
  );
  // Factura sin probar la modalidad (F3-03): «Por hitos», en las mismas etapas que antes.
  await conModalidad(cliente(), servicioId);
  const centro = await abm().crear(admin, CENTROS_DE_COSTO, {
    nombre: "Administración",
    clase: "gestion_administrativa",
    descripcion: "",
    activo: "si",
  });
  if (!centro.ok) {
    throw new Error(`el centro no pasó: ${JSON.stringify(centro.errores)}`);
  }
  centroId = centro.registro.valor.id;
});

describe.each(documentos)("$nombre", (documento) => {
  test("en dólares con tipo de cambio: se guarda la fracción exacta y la fuente sin espacios", async () => {
    const resultado = await documento.crear(
      documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
    );

    expect(resultado.ok).toBe(true);
    expect(await documento.columnas()).toEqual([
      118_425n,
      100n,
      "Cotización de ejemplo",
    ]);
  });

  test("en dólares sin tipo de cambio: se rechaza con su código al lado del campo y no se escribe nada", async () => {
    const resultado = await documento.crear(
      documento.escritoBase({ ...EN_DOLARES, cambio: "", cambioFuente: "" }),
    );

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.errores.cambio).toContain(
      catalogo.DOM_0013.codigo,
    );
    expect(await documento.cantidad()).toBe(0);
  });

  test.each([
    ["un valor que no es un número", { cambio: "abc" }, "coma"],
    ["un valor en cero", { cambio: "0" }, "coma"],
    ["sin fuente", { cambioFuente: "   " }, "de dónde"],
  ])(
    "en dólares con %s: se rechaza y no se escribe nada",
    async (_caso, cambios, texto) => {
      const resultado = await documento.crear(
        documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO, ...cambios }),
      );

      expect(resultado.ok).toBe(false);
      expect(!resultado.ok && resultado.errores.cambio).toContain(texto);
      expect(await documento.cantidad()).toBe(0);
    },
  );

  test("en pesos sin tipo de cambio: se guarda sin él", async () => {
    const resultado = await documento.crear(documento.escritoBase({}));

    expect(resultado.ok).toBe(true);
    expect(await documento.columnas()).toEqual([null, null, null]);
  });

  test("en pesos con tipo de cambio: se rechaza con su código y no se escribe nada", async () => {
    const resultado = await documento.crear(
      documento.escritoBase({ ...CON_CAMBIO }),
    );

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.errores.cambio).toContain(
      catalogo.DOM_0013.codigo,
    );
    expect(await documento.cantidad()).toBe(0);
  });
});

describe("lo ya cargado queda sin tipo de cambio y se completa", () => {
  test.each([["orden de compra"], ["factura"]])(
    "la %s en dólares sin tipo de cambio se marca; en pesos no muestra nada",
    async (nombre) => {
      const casos = nombre === "factura" ? facturas() : ordenes();
      const documento = documentos.find((d) => d.nombre === nombre);
      expect(documento).toBeDefined();
      const viejo = documento as Documento;
      const enDolares = await viejo.crear(
        viejo.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
      );
      expect(enDolares.ok).toBe(true);
      const idEnDolares = enDolares.ok ? enDolares.id : "";
      await viejo.sinCambio(idEnDolares);
      await viejo.crear(
        viejo.escritoBase({
          numero: "otro-0002",
          fecha: "2031-07-09",
          vencimiento: "2031-08-09",
          importe: "5,00",
        }),
      );

      const filas = await casos.listar(servicioId);

      expect(filas.map((fila) => fila.cambio)).toEqual([
        null,
        { texto: "sin tipo de cambio", falta: true },
      ]);
    },
  );

  test("el egreso en dólares sin tipo de cambio dice «sin tipo de cambio» en el listado; en pesos, nada", async () => {
    const enDolares = await documentos[2]?.crear(
      documentos[2].escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
    );
    await documentos[2]?.sinCambio(enDolares?.ok ? enDolares.id : "");
    await documentos[2]?.crear(
      documentos[2].escritoBase({ concepto: "En pesos" }),
    );

    const { celdas, registros } = await abm().listar(EGRESOS, {});

    const cambioDe = (concepto: string) => {
      const fila = registros.find(({ valor }) => valor.concepto === concepto);
      return celdas[fila?.valor.id ?? ""]?.[
        cabecerasDe(EGRESOS).indexOf("Tipo de cambio")
      ];
    };
    expect(cambioDe("Combustible")).toBe("sin tipo de cambio");
    expect(cambioDe("En pesos")).toBe("");
  });

  test.each([
    ["orden de compra", () => ordenes()],
    ["factura", () => facturas()],
  ])(
    "completar el tipo de cambio de la %s lo guarda y el listado lo muestra",
    async (nombre, casos) => {
      const documento = documentos.find(
        (d) => d.nombre === nombre,
      ) as Documento;
      const creado = await documento.crear(
        documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
      );
      const id = creado.ok ? creado.id : "";
      await documento.sinCambio(id);

      const resultado = await casos().guardarTipoDeCambio(admin, id, {
        cambio: "1.200",
        cambioFuente: "Otra cotización",
      });

      expect(resultado).toEqual({ ok: true });
      expect(await documento.columnas()).toEqual([
        1_200n,
        1n,
        "Otra cotización",
      ]);
      const [fila] = await casos().listar(servicioId);
      expect(fila?.cambio).toEqual({
        texto: "1.200 · Otra cotización",
        falta: false,
      });
      expect(
        await cliente().auditoria.count({ where: { accion: "actualizar" } }),
      ).toBe(1);
    },
  );

  test.each([
    ["orden de compra", () => ordenes()],
    ["factura", () => facturas()],
  ])(
    "completar el tipo de cambio de la %s con un valor ilegible lo rechaza y no escribe",
    async (nombre, casos) => {
      const documento = documentos.find(
        (d) => d.nombre === nombre,
      ) as Documento;
      const creado = await documento.crear(
        documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
      );
      const id = creado.ok ? creado.id : "";
      await documento.sinCambio(id);

      const resultado = await casos().guardarTipoDeCambio(admin, id, {
        cambio: "mil",
        cambioFuente: "Otra cotización",
      });

      expect(resultado.ok).toBe(false);
      expect(await documento.columnas()).toEqual([null, null, null]);
    },
  );

  test("completar el tipo de cambio exige un rol que escriba", async () => {
    const documento = documentos[0] as Documento;
    const creado = await documento.crear(
      documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
    );

    await expect(
      ordenes().guardarTipoDeCambio(exAdmin, creado.ok ? creado.id : "", {
        cambio: "2",
        cambioFuente: "x",
      }),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
  });
});

describe("el egreso, que se edita", () => {
  async function egresoViejoEnDolares(): Promise<string> {
    const documento = documentos[2] as Documento;
    const creado = await documento.crear(
      documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
    );
    const id = creado.ok ? creado.id : "";
    await documento.sinCambio(id);
    return id;
  }

  test("editar uno en dólares sin tipo de cambio exige completarlo", async () => {
    const id = await egresoViejoEnDolares();
    const base = (documentos[2] as Documento).escritoBase(EN_DOLARES);

    const sin = await abm().guardar(admin, EGRESOS, id, base);
    expect(sin.ok).toBe(false);
    expect(!sin.ok && sin.errores.cambio).toContain(catalogo.DOM_0013.codigo);

    const con = await abm().guardar(admin, EGRESOS, id, {
      ...base,
      ...CON_CAMBIO,
    });
    expect(con.ok).toBe(true);
    expect((await abm().obtener(EGRESOS, id)).valor.cambio).toEqual({
      valor: { numerador: 118_425n, denominador: 100n },
      fuente: "Cotización de ejemplo",
    });
  });

  test("la pantalla del egreso muestra su tipo de cambio, el aviso si no lo tiene y nada si es en pesos", async () => {
    const documento = documentos[2] as Documento;
    const detalleDe = async (id: string) =>
      (await crearCasosUsoPagos(dependencias()).detalle(id)).datos.find(
        ({ etiqueta }) => etiqueta === "Tipo de cambio",
      )?.valor;
    const conCambio = await documento.crear(
      documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
    );
    const viejo = await egresoViejoEnDolares();
    const enPesos = await documento.crear(
      documento.escritoBase({ concepto: "En pesos" }),
    );

    expect(await detalleDe(conCambio.ok ? conCambio.id : "")).toBe(
      "1.184,25 · Cotización de ejemplo",
    );
    expect(await detalleDe(viejo)).toBe("sin tipo de cambio");
    expect(await detalleDe(enPesos.ok ? enPesos.id : "")).toBe("");
  });

  test("pasarlo de dólares a pesos, sin tipo de cambio, lo borra", async () => {
    const documento = documentos[2] as Documento;
    const creado = await documento.crear(
      documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
    );
    const id = creado.ok ? creado.id : "";

    const resultado = await abm().guardar(
      admin,
      EGRESOS,
      id,
      documento.escritoBase({ importeMoneda: "ARS" }),
    );

    expect(resultado.ok).toBe(true);
    expect(await documento.columnas()).toEqual([null, null, null]);
  });

  test("al editar, el formulario trae el tipo de cambio guardado", async () => {
    const documento = documentos[2] as Documento;
    const creado = await documento.crear(
      documento.escritoBase({ ...EN_DOLARES, ...CON_CAMBIO }),
    );

    const { valor } = await abm().obtener(EGRESOS, creado.ok ? creado.id : "");
    const escrito = escritoDe(EGRESOS, valor);

    expect(escrito).toMatchObject({
      cambio: "1.184,25",
      cambioFuente: "Cotización de ejemplo",
      importeMoneda: "USD",
    });
  });
});
