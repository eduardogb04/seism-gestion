/**
 * Lo que la pantalla le pide a los documentos (F2-05, ADR 0035), contra el
 * Postgres de verdad del arnés y un almacén en disco: las Server Actions de
 * cargar y anular una cotización, llamadas como las llama Next (con un
 * `FormData` que trae un `File`), y la descarga `GET /documentos/<id>`: solo con
 * sesión, con las cabeceras que no dejan ejecutar ni cachear el archivo, y 404
 * para lo que no hay. Solo se reemplaza lo que es de Next o del armado: la
 * cookie y el punto de armado.
 *
 * Datos inventados. Necesita Docker corriendo.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { crearAlmacenDisco } from "../../src/adaptadores/disco/almacen-documentos.ts";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import {
  crearCasosUsoDocumentos,
  TOPE_DE_DOCUMENTO,
} from "../../src/casos-uso/documentos/documentos.ts";
import { crearCasosUsoCotizaciones } from "../../src/casos-uso/servicios/cotizaciones.ts";
import { crearCasosUsoSesion } from "../../src/casos-uso/sesion/sesion.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import {
  OPERADOR,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { sembrarServicio } from "./_arnes/servicio.ts";

const { cookie, punto } = vi.hoisted(() => ({
  cookie: { valor: undefined as string | undefined },
  punto: { armado: undefined as unknown },
}));

vi.mock("next/headers.js", () => ({
  cookies: async () => ({
    get: (nombre: string) =>
      nombre === "seism_sesion" && cookie.valor !== undefined
        ? { name: nombre, value: cookie.valor }
        : undefined,
  }),
}));

vi.mock("../../src/infraestructura/arranque/armado.ts", () => ({
  armado: () => punto.armado,
}));

const { cargarCotizacion, anularCotizacion } = await import(
  "../../src/app/servicios/acciones.ts"
);
const { GET } = await import("../../src/app/documentos/[id]/route.ts");

const SIN_SESION = "/ingresar/error?codigo=AUT-0002";
const VACIO = { escrito: {}, errores: {} };
const PDF = new TextEncoder().encode("%PDF-1.4\nCotización de ejemplo\n");

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let carpeta = "";
const carpetas: string[] = [];
let almacen: AlmacenDocumentos;
let operador: UsuarioSembrado;
let servicioId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function reloj() {
  const fecha = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 10,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!fecha.ok) {
    throw new Error(fecha.mensaje);
  }
  return RelojFijo(fecha.fechaHora);
}

/** A dónde redirige una acción o una ruta que tiene que redirigir. */
async function destino(accion: Promise<unknown>): Promise<string> {
  try {
    await accion;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
      return digest.split(";")[2] ?? "";
    }
    throw error;
  }
  throw new Error("tendría que haber redirigido");
}

function formulario(
  campos: Record<string, string>,
  archivo?: { nombre: string; bytes: Uint8Array },
): FormData {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) {
    datos.set(nombre, valor);
  }
  if (archivo !== undefined) {
    datos.set("archivo", new File([archivo.bytes], archivo.nombre));
  }
  return datos;
}

const CAMPOS = {
  fecha: "2031-07-08",
  importe: "12.500,00",
  importeMoneda: "ARS",
  observaciones: "",
};

async function cargada(nombre = "cotizacion.pdf"): Promise<string> {
  await destino(
    cargarCotizacion(
      servicioId,
      VACIO,
      formulario(CAMPOS, { nombre, bytes: PDF }),
    ),
  );
  const { documentoId } = await cliente().cotizacion.findFirstOrThrow({
    orderBy: { version: "desc" },
  });
  return documentoId;
}

function pedir(id: string) {
  return GET(new Request(`http://localhost/documentos/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
  for (const usada of carpetas) {
    await rm(usada, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  await limpiarBase();
  carpeta = await mkdtemp(path.join(tmpdir(), "seism-documentos-"));
  carpetas.push(carpeta);
  almacen = crearAlmacenDisco({ directorio: carpeta });
  const [sembrado] = await sembrarUsuarios(cliente(), [OPERADOR]);
  if (sembrado === undefined) {
    throw new Error("no se sembró el operador");
  }
  operador = sembrado;
  const dependencias = {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: reloj(),
    generadorId: crearGeneradorIdCrypto(),
  };
  const sesion = crearCasosUsoSesion({
    transaccional: dependencias.transaccional,
    reloj: reloj(),
  });
  punto.armado = {
    sesion,
    cotizaciones: crearCasosUsoCotizaciones({
      ...dependencias,
      almacen,
      nuevaClave: nuevaClaveDocumento,
    }),
    documentos: crearCasosUsoDocumentos({
      transaccional: dependencias.transaccional,
      almacen,
    }),
  };
  const abierta = await sesion.completarSesion(
    {
      proveedor: "falsa",
      sub: `falsa:${OPERADOR.email}`,
      email: OPERADOR.email,
      emailVerificado: true,
    },
    null,
  );
  cookie.valor = abierta.id;
  servicioId = await sembrarServicio(
    cliente(),
    dependencias,
    { tipo: "persona", usuarioId: sembrado.id },
    sembrado.id,
  );
});

describe("cargar una cotización desde el formulario", () => {
  test("guarda con el actor de la sesión, con el archivo que vino en el formulario, y vuelve a la pantalla del servicio", async () => {
    const va = await destino(
      cargarCotizacion(
        servicioId,
        VACIO,
        formulario(CAMPOS, { nombre: "cotizacion.pdf", bytes: PDF }),
      ),
    );

    expect(va).toBe(`/servicios/${servicioId}`);
    const cotizacion = await cliente().cotizacion.findFirstOrThrow();
    expect(cotizacion.creadoPor).toEqual({
      tipo: "persona",
      usuarioId: operador.id,
    });
    const documento = await cliente().documento.findUniqueOrThrow({
      where: { id: cotizacion.documentoId },
    });
    expect(documento.tamano).toBe(PDF.length);
  });

  test("sin sesión, AUT-0002 y nada cambia", async () => {
    cookie.valor = undefined;

    expect(
      await destino(
        cargarCotizacion(
          servicioId,
          VACIO,
          formulario(CAMPOS, { nombre: "cotizacion.pdf", bytes: PDF }),
        ),
      ),
    ).toBe(SIN_SESION);

    expect(await cliente().cotizacion.count()).toBe(0);
    expect(await cliente().documento.count()).toBe(0);
  });

  test("un archivo rechazado vuelve con su mensaje y con todo lo demás que se escribió", async () => {
    const estado = await cargarCotizacion(
      servicioId,
      VACIO,
      formulario(
        { ...CAMPOS, observaciones: "Una nota" },
        { nombre: "programa.exe", bytes: PDF },
      ),
    );

    expect(estado.errores).toEqual({
      archivo: expect.stringContaining("Volvé a elegir el archivo"),
    });
    expect(estado.escrito).toEqual({ ...CAMPOS, observaciones: "Una nota" });
    expect(await cliente().cotizacion.count()).toBe(0);
  });

  test("sin archivo elegido (el navegador manda una parte sin nombre) pide el documento; uno vacío, también lo dice", async () => {
    const sinArchivo = formulario(CAMPOS);
    sinArchivo.set("archivo", new File([], ""));

    expect(
      (await cargarCotizacion(servicioId, VACIO, sinArchivo)).errores.archivo,
    ).toContain("Elegí el documento");
    expect(
      (
        await cargarCotizacion(
          servicioId,
          VACIO,
          formulario(CAMPOS, {
            nombre: "vacio.pdf",
            bytes: new Uint8Array(),
          }),
        )
      ).errores.archivo,
    ).toContain("está vacío");
  });

  test("un archivo de 2 MB llega entero (el tope de Next ya no corta en 1 MB)", async () => {
    const dosMb = new Uint8Array(2 * 1024 * 1024);
    dosMb.set(PDF);

    await destino(
      cargarCotizacion(
        servicioId,
        VACIO,
        formulario(CAMPOS, { nombre: "grande.pdf", bytes: dosMb }),
      ),
    );

    expect((await cliente().documento.findFirstOrThrow()).tamano).toBe(
      dosMb.length,
    );
  });

  test("anular vuelve a la pantalla del servicio; con otra cosa que un id, DOM-0009 en pantalla", async () => {
    await cargada();
    const { id } = await cliente().cotizacion.findFirstOrThrow();

    expect(
      await destino(anularCotizacion(servicioId, id, VACIO, formulario({}))),
    ).toBe(`/servicios/${servicioId}`);
    expect(
      (await cliente().cotizacion.findFirstOrThrow()).eliminadoEn,
    ).not.toBeNull();
    expect(
      (await anularCotizacion(servicioId, "no-es-un-id", VACIO, formulario({})))
        .error?.codigo,
    ).toBe(catalogo.DOM_0009.codigo);
  });
});

describe("el tope de Next para las Server Actions", () => {
  test("está apenas por encima de los 10 MB del documento: el rechazo lo da el caso de uso, no Next", async () => {
    const { default: configuracion } = await import("../../next.config.ts");

    const limite =
      configuracion("phase-test").experimental?.serverActions?.bodySizeLimit;

    expect(limite).toMatch(/^1[0-9]mb$/i);
    const megas = Number.parseInt(String(limite), 10);
    expect(megas * 1024 * 1024).toBeGreaterThan(TOPE_DE_DOCUMENTO);
    expect(megas).toBeLessThanOrEqual(12);
  });
});

describe("GET /documentos/<id>", () => {
  test("con sesión devuelve los bytes, con su tipo y las cabeceras de una descarga", async () => {
    const documentoId = await cargada("Cotización mayo.pdf");

    const respuesta = await pedir(documentoId);

    expect(respuesta.status).toBe(200);
    expect(
      Buffer.from(await respuesta.arrayBuffer()).equals(Buffer.from(PDF)),
    ).toBe(true);
    expect(respuesta.headers.get("content-type")).toBe("application/pdf");
    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
    expect(respuesta.headers.get("cache-control")).toBe("private, no-store");
    expect(respuesta.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Cotizaci_n mayo.pdf\"; filename*=UTF-8''Cotizaci%C3%B3n%20mayo.pdf",
    );
  });

  test("sin sesión redirige a AUT-0002 y no devuelve un solo byte", async () => {
    const documentoId = await cargada();
    cookie.valor = undefined;

    expect(await destino(pedir(documentoId))).toBe(SIN_SESION);
  });

  test("con una sesión que ya no vale tampoco", async () => {
    const documentoId = await cargada();
    cookie.valor = "una-sesion-que-nunca-existio";

    expect(await destino(pedir(documentoId))).toBe(SIN_SESION);
  });

  test("un nombre hostil no inyecta cabeceras ni lleva comillas, saltos de línea ni barras", async () => {
    const documentoId = await cargada(
      'a"\r\nX-Inyectada: si\r\n\r\n<b>/../ñandú\\.pdf',
    );

    const respuesta = await pedir(documentoId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("x-inyectada")).toBeNull();
    const disposicion = respuesta.headers.get("content-disposition") ?? "";
    expect(disposicion).not.toMatch(/[\r\n/\\]/);
    expect(disposicion).toBe(
      "attachment; filename=\"a___X-Inyectada: si____<b>_..__and__.pdf\"; filename*=UTF-8''a___X-Inyectada%3A%20si____%3Cb%3E_.._%C3%B1and%C3%BA_.pdf",
    );
  });

  test.each([
    ["que no existe", () => crypto.randomUUID()],
    ["que no es un id", () => "../../etc/passwd"],
    ["con la clave del almacén", () => "documentos/2031/algo"],
  ])("un documento %s es 404", async (_caso, id) => {
    const respuesta = await pedir(id());

    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).toBe("");
  });

  test("uno dado de baja (su cotización anulada) es 404", async () => {
    const documentoId = await cargada();
    const { id } = await cliente().cotizacion.findFirstOrThrow();
    await destino(anularCotizacion(servicioId, id, VACIO, formulario({})));

    expect((await pedir(documentoId)).status).toBe(404);
  });

  test("uno que el almacén perdió es 404", async () => {
    const documentoId = await cargada();
    await rm(carpeta, { recursive: true, force: true });

    expect((await pedir(documentoId)).status).toBe(404);
  });
});
