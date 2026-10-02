/**
 * Cotizaciones de un servicio y documentos adjuntos (F2-05, ADR 0035) contra el
 * Postgres de verdad del arnés y un almacén en disco: la versión que se numera
 * sola (también con altas simultáneas), el motivo desde la segunda, el archivo
 * validado por su extensión y por sus primeros bytes, el tope de tamaño, el
 * paso de «Solicitado» a «Cotizado» en la misma transacción, la anulación y la
 * baja del servicio.
 *
 * Datos inventados. Necesita Docker corriendo.
 */

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { crearAlmacenDisco } from "../../src/adaptadores/disco/almacen-documentos.ts";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import {
  type ArchivoSubido,
  TOPE_DE_DOCUMENTO,
} from "../../src/casos-uso/documentos/documentos.ts";
import { crearCasosUsoCotizaciones } from "../../src/casos-uso/servicios/cotizaciones.ts";
import { crearCasosUsoServicios } from "../../src/casos-uso/servicios/servicios.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import type { Transaccional } from "../../src/puertos/repositorios/transaccion.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  OPERADOR,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
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

const PDF = new TextEncoder().encode("%PDF-1.4\nCotización de ejemplo\n");

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let carpeta = "";
const carpetas: string[] = [];
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

function dependencias(transaccional?: Transaccional) {
  return {
    transaccional: transaccional ?? crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  };
}

function casos(transaccional?: Transaccional) {
  return crearCasosUsoCotizaciones({
    ...dependencias(transaccional),
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

function archivo(
  nombre = "cotizacion.pdf",
  bytes: Uint8Array = PDF,
): ArchivoSubido {
  return { nombre, bytes };
}

function escrito(cambios: Escrito = {}): Escrito {
  return {
    fecha: "2031-07-08",
    importe: "12.500,00",
    importeMoneda: "ARS",
    observaciones: "",
    ...cambios,
  };
}

/** Carga una cotización que tiene que pasar y devuelve su id. */
async function cargar(
  cambios: Escrito = {},
  adjunto: ArchivoSubido = archivo(),
  deQuien = admin,
  paraServicio = servicioId,
): Promise<string> {
  const resultado = await casos().crear(
    deQuien,
    paraServicio,
    escrito(cambios),
    adjunto,
  );
  if (!resultado.ok) {
    throw new Error(`la carga no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.id;
}

async function erroresDe(
  cambios: Escrito,
  adjunto: ArchivoSubido | null = archivo(),
) {
  const resultado = await casos().crear(
    admin,
    servicioId,
    escrito(cambios),
    adjunto,
  );
  return resultado.ok ? {} : resultado.errores;
}

function estado(id = servicioId): Promise<string | undefined> {
  return cliente()
    .servicioEvento.findMany({
      where: { servicioId: id },
      orderBy: { posicion: "desc" },
      take: 1,
    })
    .then(([ultimo]) => ultimo?.a);
}

async function filas() {
  return {
    cotizaciones: await cliente().cotizacion.count(),
    documentos: await cliente().documento.count(),
    eventos: await cliente().servicioEvento.count(),
    auditoria: await cliente().auditoria.count(),
    archivos: await archivosEnElAlmacen(),
  };
}

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
  for (const usada of carpetas) {
    await rm(usada, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  await limpiarBase();
  carpeta = await mkdtemp(path.join(tmpdir(), "seism-cotizaciones-"));
  carpetas.push(carpeta);
  almacen = crearAlmacenDisco({ directorio: carpeta });
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

describe("cargar la primera cotización", () => {
  test("guarda el archivo en el almacén, el metadato y la cabecera, y deja todo en la auditoría", async () => {
    const id = await cargar({ observaciones: "Sin observaciones" });

    const cotizacion = await cliente().cotizacion.findUniqueOrThrow({
      where: { id },
    });
    expect(cotizacion).toMatchObject({
      servicioId,
      version: 1,
      fecha: new Date("2031-07-08T00:00:00.000Z"),
      importeCentavos: 1_250_000n,
      importeMoneda: "ARS",
      motivo: null,
      observaciones: "Sin observaciones",
      creadoPor: admin,
    });
    const documento = await cliente().documento.findUniqueOrThrow({
      where: { id: cotizacion.documentoId },
    });
    expect(documento).toMatchObject({
      nombre: "cotizacion.pdf",
      tipoMime: "application/pdf",
      tamano: PDF.length,
      creadoPor: admin,
    });
    expect(documento.referencia).toMatch(/^documentos\/2[0-9]{3}\//);
    const guardado = await almacen.leer(
      documento.referencia as Parameters<AlmacenDocumentos["leer"]>[0],
    );
    expect(Buffer.from(guardado).equals(Buffer.from(PDF))).toBe(true);
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: { in: ["Cotizacion", "Documento"] } },
    });
    expect(
      auditoria.map(({ entidad, accion }) => [entidad, accion]).sort(),
    ).toEqual([
      ["Cotizacion", "crear"],
      ["Documento", "crear"],
    ]);
    expect(
      auditoria.find(({ entidad }) => entidad === "Cotizacion")?.despues,
    ).toMatchObject({ importe: { centavos: "1250000", moneda: "ARS" } });
  });

  test("pasa el servicio de solicitado a cotizado, con su nota, en la misma transacción", async () => {
    expect(await estado()).toBe("solicitado");

    await cargar();

    expect(await estado()).toBe("cotizado");
    const [, evento] = await cliente().servicioEvento.findMany({
      where: { servicioId },
      orderBy: { posicion: "asc" },
    });
    expect(evento).toMatchObject({
      de: "solicitado",
      a: "cotizado",
      nota: "Cotización v1 cargada",
      actor: admin,
    });
  });

  test("si la transacción falla después de escribir, no queda ni la cotización, ni el documento ni el cambio de estado", async () => {
    const real = crearTransaccionalPrisma(cliente());
    const fallida: Transaccional = {
      ejecutar: (trabajo) =>
        real.ejecutar(async (repos) => {
          await trabajo(repos);
          throw new Error("falla de prueba");
        }),
    };
    const antes = await filas();

    await expect(
      casos(fallida).crear(admin, servicioId, escrito(), archivo()),
    ).rejects.toThrow("falla de prueba");

    // El archivo queda huérfano en el almacén: se acepta, está escrito en el ADR 0035.
    expect(await filas()).toEqual({ ...antes, archivos: antes.archivos + 1 });
    expect(await estado()).toBe("solicitado");
  });

  test("un operador también carga; quien no es administrador ni operador activo, no", async () => {
    await cargar({}, archivo(), operador);
    const antes = await filas();

    await expect(
      casos().crear(exAdmin, servicioId, escrito(), archivo()),
    ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });

    expect(await filas()).toEqual(antes);
  });

  test("la primera no pide motivo; el formulario de la primera no lo trae y trae la fecha de hoy", async () => {
    const { campos, escrito: inicial } = await casos().formulario(servicioId);

    expect(campos.map(([nombre]) => nombre)).toEqual([
      "fecha",
      "importe",
      "observaciones",
    ]);
    expect(inicial).toEqual({ fecha: "2031-07-09" });
    expect(campos.find(([nombre]) => nombre === "fecha")?.[1].tipo).toBe(
      "fecha",
    );
  });
});

describe("la segunda cotización y las que siguen", () => {
  test("sin motivo vuelve el mensaje en el campo y no se escribe nada; con motivo es la versión 2", async () => {
    await cargar();
    const antes = await filas();

    expect(await erroresDe({ motivo: "   " })).toEqual({
      motivo: "Escribí el motivo de la revisión.",
    });
    expect(await filas()).toEqual(antes);

    const id = await cargar({ motivo: "Cambió el alcance" });
    const fila = await cliente().cotizacion.findUniqueOrThrow({
      where: { id },
    });
    expect([fila.version, fila.motivo]).toEqual([2, "Cambió el alcance"]);
  });

  test("el formulario de la segunda trae el motivo", async () => {
    await cargar();

    const { campos } = await casos().formulario(servicioId);

    expect(campos.map(([nombre]) => nombre)).toEqual([
      "fecha",
      "importe",
      "motivo",
      "observaciones",
    ]);
  });

  test("no cambia el estado: el servicio sigue cotizado y no hay un evento más", async () => {
    await cargar();
    const antes = (await filas()).eventos;

    await cargar({ motivo: "Cambió el alcance" });

    expect(await estado()).toBe("cotizado");
    expect((await filas()).eventos).toBe(antes);
  });

  test("en otro estado que no es solicitado, cargar una cotización no cambia el estado", async () => {
    const servicios = crearCasosUsoServicios(dependencias());
    await servicios.cambiarEstado(admin, servicioId, "cotizado", "");
    await servicios.cambiarEstado(admin, servicioId, "adjudicado", "");
    const antes = (await filas()).eventos;

    await cargar();

    expect(await estado()).toBe("adjudicado");
    expect((await filas()).eventos).toBe(antes);
  });

  test("dos cargas a la vez no repiten versión ni terminan en un error crudo", async () => {
    await cargar();

    const resultados = await Promise.all([
      casos().crear(admin, servicioId, escrito({ motivo: "Uno" }), archivo()),
      casos().crear(admin, servicioId, escrito({ motivo: "Otro" }), archivo()),
    ]);

    expect(resultados.every(({ ok }) => ok)).toBe(true);
    const versiones = await cliente().cotizacion.findMany({
      orderBy: { version: "asc" },
    });
    expect(versiones.map(({ version }) => version)).toEqual([1, 2, 3]);
  });

  test("dos primeras cotizaciones a la vez: una entra y la otra vuelve pidiendo el motivo, sin error crudo", async () => {
    const resultados = await Promise.all([
      casos().crear(admin, servicioId, escrito(), archivo()),
      casos().crear(admin, servicioId, escrito(), archivo()),
    ]);

    expect(resultados.filter(({ ok }) => ok)).toHaveLength(1);
    expect(resultados.find((resultado) => !resultado.ok)).toEqual({
      ok: false,
      errores: { motivo: "Escribí el motivo de la revisión." },
    });
    expect(await cliente().cotizacion.count()).toBe(1);
  });
});

describe("lo que se escribe en el formulario", () => {
  test("la fecha y el importe se validan como en Egresos", async () => {
    expect(await erroresDe({ fecha: "2031-02-30" })).toHaveProperty("fecha");
    expect(await erroresDe({ importe: "0,00" })).toHaveProperty("importe");
    expect(await erroresDe({ importe: "12abc" })).toHaveProperty("importe");
    expect(await erroresDe({ importeMoneda: "EUR" })).toHaveProperty("importe");
  });

  test("las observaciones tienen tope de 2000 caracteres", async () => {
    expect(await erroresDe({ observaciones: "x".repeat(2001) })).toEqual({
      observaciones: "No puede pasar de 2000 caracteres.",
    });
    await cargar({ observaciones: "x".repeat(2000) });
  });
});

describe("el documento", () => {
  test.each([
    ["cotizacion.pdf", "%PDF-1.7", "application/pdf"],
    ["cotizacion.PDF", "%PDF-1.7", "application/pdf"],
    ["foto.jpg", "ÿØÿbytes", "image/jpeg"],
    ["foto.jpeg", "ÿØÿbytes", "image/jpeg"],
  ])(
    "%s con sus primeros bytes se guarda como %s",
    async (nombre, cabecera, mime) => {
      const bytes = Uint8Array.from(Buffer.from(cabecera, "latin1"));

      const id = await cargar({}, archivo(nombre, bytes));

      const { documentoId } = await cliente().cotizacion.findUniqueOrThrow({
        where: { id },
      });
      expect(
        (
          await cliente().documento.findUniqueOrThrow({
            where: { id: documentoId },
          })
        ).tipoMime,
      ).toBe(mime);
    },
  );

  test.each([
    [
      "cotizacion.docx",
      [0x50, 0x4b, 0x03, 0x04],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [
      "planilla.xlsx",
      [0x50, 0x4b, 0x03, 0x04],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    ["cotizacion.doc", [0xd0, 0xcf, 0x11, 0xe0], "application/msword"],
    ["planilla.xls", [0xd0, 0xcf, 0x11, 0xe0], "application/vnd.ms-excel"],
    ["foto.png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
  ])(
    "%s con la firma de su familia se acepta con el tipo que sale de la extensión",
    async (nombre, firma, mime) => {
      const id = await cargar(
        {},
        archivo(nombre, Uint8Array.from([...firma, 1, 2])),
      );

      const { documentoId } = await cliente().cotizacion.findUniqueOrThrow({
        where: { id },
      });
      expect(
        (
          await cliente().documento.findUniqueOrThrow({
            where: { id: documentoId },
          })
        ).tipoMime,
      ).toBe(mime);
    },
  );

  test.each([
    [
      "un ejecutable renombrado a .pdf",
      "cotizacion.pdf",
      [0x4d, 0x5a, 0x90, 0x00],
    ],
    ["un PDF con extensión .docx", "cotizacion.docx", [0x25, 0x50, 0x44, 0x46]],
    [
      "un PNG con extensión .jpg",
      "foto.jpg",
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ],
    ["un texto con extensión .xls", "planilla.xls", [0x68, 0x6f, 0x6c, 0x61]],
  ])(
    "%s se rechaza por sus primeros bytes, con el mensaje al lado del campo y sin escribir nada",
    async (_caso, nombre, bytes) => {
      const antes = await filas();

      const errores = await erroresDe(
        {},
        archivo(nombre, Uint8Array.from(bytes)),
      );

      expect(errores).toEqual({
        archivo: expect.stringContaining(
          "no es del tipo que dice su extensión",
        ),
      });
      expect(await filas()).toEqual(antes);
    },
  );

  test.each(["programa.exe", "script.sh", "sin-extension", "doble.pdf.exe"])(
    "%s es un tipo no admitido: se rechaza y se dice qué se admite",
    async (nombre) => {
      const antes = await filas();

      const errores = await erroresDe({}, archivo(nombre));

      expect(errores.archivo).toContain("PDF, Word, Excel, JPG o PNG");
      expect(await filas()).toEqual(antes);
    },
  );

  test("un archivo vacío, o ninguno, se rechaza pidiendo volver a elegirlo", async () => {
    const antes = await filas();

    const vacio = await erroresDe(
      {},
      archivo("cotizacion.pdf", new Uint8Array()),
    );
    const ninguno = await erroresDe({}, null);

    expect(vacio.archivo).toContain("está vacío");
    expect(ninguno.archivo).toContain("Elegí el documento");
    expect(await filas()).toEqual(antes);
  });

  test("el rechazo del archivo no tapa los otros: vuelven los dos mensajes", async () => {
    expect(
      Object.keys(
        await erroresDe({ importe: "" }, archivo("script.sh")),
      ).sort(),
    ).toEqual(["archivo", "importe"]);
  });

  test("el tope es de 10 MB: 10 MB justos entran y 10 MB más un byte, no", async () => {
    const lleno = (bytes: number) => {
      const contenido = new Uint8Array(bytes);
      contenido.set(PDF);
      return contenido;
    };
    const antes = await filas();

    const demasiado = await erroresDe(
      {},
      archivo("grande.pdf", lleno(TOPE_DE_DOCUMENTO + 1)),
    );

    expect(demasiado.archivo).toContain("10 MB");
    expect(await filas()).toEqual(antes);
    const id = await cargar({}, archivo("justo.pdf", lleno(TOPE_DE_DOCUMENTO)));
    const { documentoId } = await cliente().cotizacion.findUniqueOrThrow({
      where: { id },
    });
    expect(
      (
        await cliente().documento.findUniqueOrThrow({
          where: { id: documentoId },
        })
      ).tamano,
    ).toBe(TOPE_DE_DOCUMENTO);
  });

  test("un nombre de más de 200 caracteres se rechaza", async () => {
    expect(
      (await erroresDe({}, archivo(`${"a".repeat(200)}.pdf`))).archivo,
    ).toContain("200 caracteres");
  });
});

describe("el servicio que recibe la cotización", () => {
  test("uno que no existe, o dado de baja, es DOM-0009 y no se escribe nada", async () => {
    const baja = await altaDeServicio(
      cliente(),
      dependencias(),
      admin,
      usuarios[0]?.id ?? "",
      "A dar de baja",
    );
    await crearCasosUsoServicios(dependencias()).marcarEliminado(admin, baja);
    const antes = await filas();

    for (const id of [baja, "no-es-un-id", crypto.randomUUID()]) {
      await expect(
        casos().crear(admin, id, escrito(), archivo()),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    }

    expect(await filas()).toEqual(antes);
  });

  test("un servicio con cotizaciones vigentes no se da de baja", async () => {
    await cargar();

    await expect(
      crearCasosUsoServicios(dependencias()).marcarEliminado(admin, servicioId),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0011.codigo });
  });
});

describe("listar", () => {
  test("la más nueva arriba, con lo que se muestra de cada una", async () => {
    await cargar({ fecha: "2031-07-01", importe: "10.000,00" });
    await cargar(
      {
        fecha: "2031-07-05",
        importe: "9.500,50",
        importeMoneda: "USD",
        motivo: "Bajó el precio",
      },
      archivo("revision.pdf"),
      operador,
    );

    const lista = await casos().listar(servicioId);

    expect(lista.map(({ version }) => version)).toEqual([2, 1]);
    expect(lista[0]).toMatchObject({
      fecha: "05/07/2031",
      importe: "USD 9.500,50",
      motivo: "Bajó el precio",
      documento: { nombre: "revision.pdf", tamano: `${PDF.length} bytes` },
      quien: "operador@ejemplo.test",
    });
    expect(lista[1]).toMatchObject({ fecha: "01/07/2031", motivo: "" });
  });
});

describe("anular", () => {
  test("la saca del listado, deja su documento dado de baja y su versión no se reutiliza", async () => {
    const primera = await cargar();
    const segunda = await cargar({ motivo: "Ajuste" });

    await casos().marcarEliminado(operador, segunda);

    expect(
      (await casos().listar(servicioId)).map(({ version }) => version),
    ).toEqual([1]);
    const anulada = await cliente().cotizacion.findUniqueOrThrow({
      where: { id: segunda },
    });
    expect(anulada.eliminadoPor).toEqual(operador);
    expect(
      (
        await cliente().documento.findUniqueOrThrow({
          where: { id: anulada.documentoId },
        })
      ).eliminadoEn,
    ).not.toBeNull();
    const acciones = await cliente().auditoria.findMany({
      where: { entidad: "Cotizacion", entidadId: segunda },
      orderBy: { en: "asc" },
    });
    expect(acciones.map(({ accion }) => accion)).toEqual(["crear", "eliminar"]);
    const tercera = await cargar({ motivo: "Otra vez" });
    expect(
      (await cliente().cotizacion.findUniqueOrThrow({ where: { id: tercera } }))
        .version,
    ).toBe(3);
    expect(primera).not.toBe(tercera);
  });

  test("no devuelve el estado del servicio", async () => {
    const id = await cargar();

    await casos().marcarEliminado(admin, id);

    expect(await estado()).toBe("cotizado");
  });

  test("una que no existe o ya está anulada es DOM-0009; quien no puede escribir, AUT-0009", async () => {
    const id = await cargar();
    await casos().marcarEliminado(admin, id);

    for (const otro of [id, "no-es-un-id", crypto.randomUUID()]) {
      await expect(casos().marcarEliminado(admin, otro)).rejects.toMatchObject({
        codigo: catalogo.DOM_0009.codigo,
      });
    }
    const vigente = await cargar({ motivo: "Otra" });
    await expect(
      casos().marcarEliminado(exAdmin, vigente),
    ).rejects.toMatchObject({
      codigo: catalogo.AUT_0009.codigo,
    });
  });
});
