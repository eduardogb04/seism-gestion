/**
 * Egresos (F2-03) y lo que el molde de ABM aprendió con ellos: el campo
 * `fecha` (un día, sin hora ni zona), el campo `importe` (centavos enteros y
 * moneda, en dos columnas), los filtros por relación y por mes, la dirección
 * del orden por defecto y la relación que solo ofrece los registros con una
 * casilla marcada (`soloSi`). Contra el Postgres de verdad del arnés.
 *
 * Datos inventados. Necesita Docker corriendo.
 */

import fc from "fast-check";
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
import { CLIENTES } from "../../src/casos-uso/abm/clientes.ts";
import type {
  DefinicionAbm,
  Escrito,
} from "../../src/casos-uso/abm/definicion.ts";
import { EGRESOS } from "../../src/casos-uso/abm/egresos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  formatearMonto,
  MONEDAS,
} from "../../src/dominio/compartido/importe.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type { EntidadAbm } from "../../src/puertos/repositorios/abm.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

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

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function casos() {
  return crearCasosUsoAbm({
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  });
}

/** El alta de lo que el egreso necesita, o el test se cae con lo que faltó. */
async function alta<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  escrito: Escrito,
): Promise<string> {
  const resultado = await casos().crear(admin, definicion, escrito);
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.registro.valor.id;
}

function altaDeCentro(nombre: string, activo = true): Promise<string> {
  return alta(CENTROS_DE_COSTO, {
    nombre,
    clase: "proyecto",
    descripcion: "",
    activo: activo ? "si" : "",
  });
}

function altaDeCliente(esProveedor: boolean): Promise<string> {
  return alta(CLIENTES, {
    razonSocial: esProveedor
      ? "Proveedora Ejemplo S.A."
      : "Cliente Ejemplo S.A.",
    cuit: esProveedor ? "30-00000002-3" : "30-00000001-5",
    condicionIva: "responsable_inscripto",
    domicilio: "Calle Falsa 123",
    localidad: "Ciudad Ejemplo",
    provincia: "cordoba",
    codigoPostal: "X5000",
    esCliente: esProveedor ? "" : "si",
    esProveedor: esProveedor ? "si" : "",
  });
}

function escritoDeEgreso(
  centroCostoId: string,
  cambios: Escrito = {},
): Escrito {
  return {
    fecha: "2026-09-03",
    concepto: "Combustible",
    centroCostoId,
    proveedorId: "",
    numeroComprobante: "",
    importe: "1.234,50",
    importeMoneda: "ARS",
    vencimiento: "",
    observaciones: "",
    ...cambios,
  };
}

function altaDeEgreso(centroCostoId: string, cambios: Escrito = {}) {
  return alta(EGRESOS, escritoDeEgreso(centroCostoId, cambios));
}

async function conceptos(
  parametros: Readonly<Record<string, unknown>> = {},
): Promise<readonly string[]> {
  const { registros } = await casos().listar(EGRESOS, parametros);
  return registros.map(({ valor }) => valor.concepto);
}

describe("egresos y los tipos de campo que trajeron", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    const [sembrado] = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
    if (sembrado === undefined) {
      throw new Error("falta el administrador sembrado");
    }
    admin = { tipo: "persona", usuarioId: sembrado.id };
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("importe", () => {
    test("propiedad: un importe cualquiera, en cualquier moneda, vuelve con los mismos centavos", async () => {
      const centro = await altaDeCentro("Administración");
      await fc.assert(
        fc.asyncProperty(
          fc.bigInt({ min: 1n, max: 2n ** 63n - 1n }),
          fc.constantFrom(...MONEDAS),
          async (centavos, moneda) => {
            const id = await altaDeEgreso(centro, {
              importe: formatearMonto({ centavos, moneda }),
              importeMoneda: moneda,
            });

            const { valor } = await casos().obtener(EGRESOS, id);
            const fila = await cliente().egreso.findUniqueOrThrow({
              where: { id },
            });

            expect(valor.importe).toEqual({ centavos, moneda });
            expect([fila.importeCentavos, fila.importeMoneda]).toEqual([
              centavos,
              moneda,
            ]);
          },
        ),
        { numRuns: 50 },
      );
    });

    test("un monto más grande que Number.MAX_SAFE_INTEGER no pierde un centavo", async () => {
      const centro = await altaDeCentro("Administración");
      const id = await altaDeEgreso(centro, {
        importe: "90.071.992.547.409,93",
        importeMoneda: "USD",
      });

      const { valor } = await casos().obtener(EGRESOS, id);

      expect(valor.importe.centavos).toBe(9_007_199_254_740_993n);
      expect(valor.importe.moneda).toBe("USD");
    });

    test.each([["abc"], ["12,345,6"], ["1,234"], ["24.31"], ["  "], [""]])(
      "el monto %j se rechaza al lado del campo y no escribe nada",
      async (monto) => {
        const centro = await altaDeCentro("Administración");

        const resultado = await casos().crear(
          admin,
          EGRESOS,
          escritoDeEgreso(centro, { importe: monto }),
        );

        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(Object.keys(resultado.errores)).toEqual(["importe"]);
          expect(resultado.errores.importe).toMatch(/importe/i);
        }
        expect(await cliente().egreso.count()).toBe(0);
      },
    );

    test.each([["0"], ["0,00"], ["-5"]])(
      "el monto %j se lee pero tiene que ser mayor que cero",
      async (monto) => {
        const centro = await altaDeCentro("Administración");

        const resultado = await casos().crear(
          admin,
          EGRESOS,
          escritoDeEgreso(centro, { importe: monto }),
        );

        expect(resultado).toEqual({
          ok: false,
          errores: { importe: "El importe tiene que ser mayor que cero." },
        });
        expect(await cliente().egreso.count()).toBe(0);
      },
    );

    test("una moneda que no existe se rechaza", async () => {
      const centro = await altaDeCentro("Administración");

      const resultado = await casos().crear(
        admin,
        EGRESOS,
        escritoDeEgreso(centro, { importeMoneda: "EUR" }),
      );

      expect(resultado).toEqual({
        ok: false,
        errores: { importe: "Elegí la moneda." },
      });
    });

    test("la auditoría guarda el importe sin perder precisión", async () => {
      const centro = await altaDeCentro("Administración");
      const id = await altaDeEgreso(centro, {
        importe: "90.071.992.547.409,93",
        importeMoneda: "USD",
      });
      await casos().guardar(
        admin,
        EGRESOS,
        id,
        escritoDeEgreso(centro, {
          importe: "90.071.992.547.409,94",
          importeMoneda: "USD",
        }),
      );

      const registros = await cliente().auditoria.findMany({
        where: { entidad: "Egreso", entidadId: id },
        orderBy: { en: "asc" },
      });

      expect(registros.map(({ accion }) => accion)).toEqual([
        "crear",
        "actualizar",
      ]);
      expect(registros[0]?.despues).toMatchObject({
        importe: { centavos: "9007199254740993", moneda: "USD" },
      });
      expect(registros[1]?.antes).toMatchObject({
        importe: { centavos: "9007199254740993", moneda: "USD" },
      });
      expect(registros[1]?.despues).toMatchObject({
        importe: { centavos: "9007199254740994", moneda: "USD" },
      });
    });

    test("guardar el mismo importe, escrito de otra manera, no escribe ni audita", async () => {
      const centro = await altaDeCentro("Administración");
      const id = await altaDeEgreso(centro, { importe: "1.234,50" });
      const antes = await cliente().auditoria.count();

      const resultado = await casos().guardar(
        admin,
        EGRESOS,
        id,
        escritoDeEgreso(centro, { importe: "1234,5" }),
      );

      expect(resultado.ok).toBe(true);
      expect(await cliente().auditoria.count()).toBe(antes);
    });

    test("el listado muestra el importe con su moneda y formato", async () => {
      const centro = await altaDeCentro("Administración");
      await altaDeEgreso(centro, {
        importe: "24.315,50",
        importeMoneda: "USD",
      });

      const { celdas } = await casos().listar(EGRESOS, {});

      expect(Object.values(celdas)[0]).toContain("USD 24.315,50");
    });
  });

  describe("fecha", () => {
    test.each([["2027-02-29"], ["2026-04-31"], ["2026-13-01"], ["abc"]])(
      "la fecha %j no existe: mensaje al lado del campo y nada escrito",
      async (fecha) => {
        const centro = await altaDeCentro("Administración");

        const resultado = await casos().crear(
          admin,
          EGRESOS,
          escritoDeEgreso(centro, { fecha }),
        );

        expect(resultado).toEqual({
          ok: false,
          errores: { fecha: "Esa fecha no existe." },
        });
        expect(await cliente().egreso.count()).toBe(0);
      },
    );

    test("sin fecha, o con un vencimiento imposible, también se rechaza", async () => {
      const centro = await altaDeCentro("Administración");

      expect(
        await casos().crear(
          admin,
          EGRESOS,
          escritoDeEgreso(centro, { fecha: "" }),
        ),
      ).toEqual({ ok: false, errores: { fecha: "Elegí una fecha." } });
      expect(
        await casos().crear(
          admin,
          EGRESOS,
          escritoDeEgreso(centro, { vencimiento: "2026-02-30" }),
        ),
      ).toEqual({
        ok: false,
        errores: { vencimiento: "Esa fecha no existe." },
      });
    });

    test("una fecha se guarda como el mismo día, sin zona horaria", async () => {
      const centro = await altaDeCentro("Administración");
      const id = await altaDeEgreso(centro, {
        fecha: "2028-02-29",
        vencimiento: "2026-12-31",
      });

      const { valor } = await casos().obtener(EGRESOS, id);
      const [fila] = await cliente().$queryRaw<
        { fecha: string; vencimiento: string }[]
      >`SELECT fecha::text AS fecha, vencimiento::text AS vencimiento FROM egresos WHERE id = ${id}::uuid`;

      expect(valor.fecha).toBe("2028-02-29");
      expect(valor.vencimiento).toBe("2026-12-31");
      expect(fila).toEqual({ fecha: "2028-02-29", vencimiento: "2026-12-31" });
    });

    test("el listado muestra las fechas como dd/mm/aaaa", async () => {
      const centro = await altaDeCentro("Administración");
      await altaDeEgreso(centro, {
        fecha: "2026-09-03",
        vencimiento: "2026-10-15",
      });

      const { celdas } = await casos().listar(EGRESOS, {});

      expect(Object.values(celdas)[0]).toEqual([
        "03/09/2026",
        "Combustible",
        "Administración",
        "",
        "ARS 1.234,50",
        "15/10/2026",
      ]);
    });
  });

  describe("orden", () => {
    beforeEach(async () => {
      const centro = await altaDeCentro("Administración");
      await altaDeEgreso(centro, {
        concepto: "B intermedio",
        fecha: "2026-09-10",
        importe: "500,00",
      });
      await altaDeEgreso(centro, {
        concepto: "A viejo",
        fecha: "2026-08-31",
        importe: "9.000,00",
      });
      await altaDeEgreso(centro, {
        concepto: "C nuevo",
        fecha: "2026-10-01",
        importe: "20,00",
        importeMoneda: "USD",
      });
    });

    test("por defecto, por fecha y lo más nuevo primero", async () => {
      expect(await conceptos()).toEqual(["C nuevo", "B intermedio", "A viejo"]);
    });

    test("por fecha, en los dos sentidos", async () => {
      expect(await conceptos({ orden: "fecha", direccion: "asc" })).toEqual([
        "A viejo",
        "B intermedio",
        "C nuevo",
      ]);
      expect(await conceptos({ orden: "fecha", direccion: "desc" })).toEqual([
        "C nuevo",
        "B intermedio",
        "A viejo",
      ]);
    });

    test("por importe, por sus centavos", async () => {
      expect(await conceptos({ orden: "importe", direccion: "asc" })).toEqual([
        "C nuevo",
        "B intermedio",
        "A viejo",
      ]);
      expect(await conceptos({ orden: "importe", direccion: "desc" })).toEqual([
        "A viejo",
        "B intermedio",
        "C nuevo",
      ]);
    });

    test("por concepto", async () => {
      expect(await conceptos({ orden: "concepto", direccion: "asc" })).toEqual([
        "A viejo",
        "B intermedio",
        "C nuevo",
      ]);
    });

    test("una columna por la que no se ordena cae al orden por defecto", async () => {
      expect(await conceptos({ orden: "observaciones" })).toEqual([
        "C nuevo",
        "B intermedio",
        "A viejo",
      ]);
    });
  });

  describe("búsqueda y filtros", () => {
    let combustibles: string;
    let oficina: string;

    beforeEach(async () => {
      combustibles = await altaDeCentro("Vehículos");
      oficina = await altaDeCentro("Administración");
      await altaDeEgreso(combustibles, {
        concepto: "Combustible de septiembre",
        fecha: "2026-09-03",
      });
      await altaDeEgreso(combustibles, {
        concepto: "Combustible de octubre",
        fecha: "2026-10-12",
        numeroComprobante: "0001-00000007",
      });
      await altaDeEgreso(oficina, {
        concepto: "Papelería",
        fecha: "2026-10-05",
      });
    });

    test("se busca por concepto y por número de comprobante", async () => {
      expect(await conceptos({ buscar: "papel" })).toEqual(["Papelería"]);
      expect(await conceptos({ buscar: "0001-0000" })).toEqual([
        "Combustible de octubre",
      ]);
    });

    test("se filtra por centro de costo", async () => {
      expect(await conceptos({ centroCostoId: oficina })).toEqual([
        "Papelería",
      ]);
    });

    test("se filtra por mes, y el mes ofrece solo los meses con egresos, el más nuevo primero", async () => {
      const listado = await casos().listar(EGRESOS, { fecha: "2026-10" });

      expect(listado.registros.map(({ valor }) => valor.concepto)).toEqual([
        "Combustible de octubre",
        "Papelería",
      ]);
      expect(listado.total).toBe(2);
      const mes = listado.filtros.find(({ columna }) => columna === "fecha");
      expect(mes).toMatchObject({
        etiqueta: "Mes",
        elegido: "2026-10",
        opciones: [
          { valor: "2026-10", texto: "10/2026" },
          { valor: "2026-09", texto: "09/2026" },
        ],
      });
    });

    test("mes y centro juntos, y con la búsqueda", async () => {
      expect(
        await conceptos({ fecha: "2026-10", centroCostoId: combustibles }),
      ).toEqual(["Combustible de octubre"]);
      expect(
        await conceptos({
          fecha: "2026-10",
          centroCostoId: combustibles,
          buscar: "septiembre",
        }),
      ).toEqual([]);
    });

    test("el centro ofrece los centros vigentes, y lo elegido queda marcado", async () => {
      const listado = await casos().listar(EGRESOS, {
        centroCostoId: oficina,
      });

      const centro = listado.filtros.find(
        ({ columna }) => columna === "centroCostoId",
      );
      expect(centro?.elegido).toBe(oficina);
      expect(centro?.opciones.map(({ texto }) => texto)).toEqual([
        "Administración",
        "Vehículos",
      ]);
    });

    test("un valor que no sirve en la URL se ignora: no filtra", async () => {
      expect(
        (await conceptos({ fecha: "2026-13", centroCostoId: "no-es-un-id" }))
          .length,
      ).toBe(3);
    });

    test("el mes cuenta desde el primero y hasta el último día, sin correrse por zona horaria", async () => {
      await altaDeEgreso(oficina, {
        concepto: "Primer día de noviembre",
        fecha: "2026-11-01",
      });
      await altaDeEgreso(oficina, {
        concepto: "Último día de octubre",
        fecha: "2026-10-31",
      });

      expect(await conceptos({ fecha: "2026-10" })).toContain(
        "Último día de octubre",
      );
      expect(await conceptos({ fecha: "2026-10" })).not.toContain(
        "Primer día de noviembre",
      );
      expect(await conceptos({ fecha: "2026-11" })).toEqual([
        "Primer día de noviembre",
      ]);
    });

    test("los egresos dados de baja no cuentan ni en el listado ni en los meses", async () => {
      const [septiembre] = (await casos().listar(EGRESOS, { fecha: "2026-09" }))
        .registros;
      await casos().marcarEliminado(admin, EGRESOS, septiembre?.valor.id ?? "");

      const listado = await casos().listar(EGRESOS, {});

      expect(listado.total).toBe(2);
      expect(
        listado.filtros
          .find(({ columna }) => columna === "fecha")
          ?.opciones.map(({ valor }) => valor),
      ).toEqual(["2026-10"]);
    });
  });

  describe("relación que solo ofrece los registros con una casilla marcada", () => {
    test("el alta ofrece solo los centros activos y los proveedores", async () => {
      await altaDeCentro("Activo");
      await altaDeCentro("Inactivo", false);
      await altaDeCliente(true);
      await altaDeCliente(false);

      const opciones = await casos().opciones(EGRESOS);

      expect(opciones.centroCostoId?.map(({ texto }) => texto)).toEqual([
        "Activo",
      ]);
      expect(opciones.proveedorId?.map(({ texto }) => texto)).toEqual([
        "Proveedora Ejemplo S.A.",
      ]);
    });

    test("al editar, el centro que quedó inactivo sigue ofreciéndose y se puede guardar sin cambiarlo", async () => {
      const centro = await altaDeCentro("Se va a desactivar");
      const otro = await altaDeCentro("Otro activo");
      const id = await altaDeEgreso(centro);
      await casos().guardar(admin, CENTROS_DE_COSTO, centro, {
        nombre: "Se va a desactivar",
        clase: "proyecto",
        descripcion: "",
        activo: "",
      });

      const alta = await casos().opciones(EGRESOS);
      const edicion = await casos().opciones(EGRESOS, id);
      const guardado = await casos().guardar(
        admin,
        EGRESOS,
        id,
        escritoDeEgreso(centro, { concepto: "Cambio de concepto" }),
      );

      expect(alta.centroCostoId?.map(({ valor }) => valor)).toEqual([otro]);
      expect(edicion.centroCostoId?.map(({ valor }) => valor)).toEqual([
        otro,
        centro,
      ]);
      expect(guardado.ok).toBe(true);
    });

    test("el servidor rechaza un centro inactivo o un cliente que no es proveedor aunque se lo fuerce", async () => {
      const inactivo = await altaDeCentro("Inactivo", false);
      const activo = await altaDeCentro("Activo");
      const soloCliente = await altaDeCliente(false);
      const id = await altaDeEgreso(activo);

      const alAlta = await casos().crear(
        admin,
        EGRESOS,
        escritoDeEgreso(inactivo),
      );
      const alCambiar = await casos().guardar(
        admin,
        EGRESOS,
        id,
        escritoDeEgreso(inactivo),
      );
      const conCliente = await casos().crear(
        admin,
        EGRESOS,
        escritoDeEgreso(activo, { proveedorId: soloCliente }),
      );

      expect(alAlta).toEqual({
        ok: false,
        errores: { centroCostoId: "Elegí una de las opciones de la lista." },
      });
      expect(alCambiar).toEqual(alAlta);
      expect(conCliente).toEqual({
        ok: false,
        errores: { proveedorId: "Elegí una de las opciones de la lista." },
      });
      expect(await cliente().egreso.count()).toBe(1);
    });

    test("un proveedor se acepta, y un centro obligatorio vacío se rechaza", async () => {
      const centro = await altaDeCentro("Activo");
      const proveedor = await altaDeCliente(true);

      const conProveedor = await altaDeEgreso(centro, {
        proveedorId: proveedor,
      });
      const sinCentro = await casos().crear(
        admin,
        EGRESOS,
        escritoDeEgreso("", {}),
      );

      expect(
        (await casos().obtener(EGRESOS, conProveedor)).valor.proveedorId,
      ).toBe(proveedor);
      expect(sinCentro).toEqual({
        ok: false,
        errores: { centroCostoId: "Elegí un centro de costo." },
      });
    });
  });

  describe("baja de lo que tiene egresos", () => {
    test("un centro de costo o un proveedor con egresos no se puede dar de baja, hasta que no los tengan", async () => {
      const centro = await altaDeCentro("Con egresos");
      const proveedor = await altaDeCliente(true);
      const egreso = await altaDeEgreso(centro, { proveedorId: proveedor });

      await expect(
        casos().marcarEliminado(admin, CENTROS_DE_COSTO, centro),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });
      await expect(
        casos().marcarEliminado(admin, CLIENTES, proveedor),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });

      await casos().marcarEliminado(admin, EGRESOS, egreso);
      await casos().marcarEliminado(admin, CENTROS_DE_COSTO, centro);
      await casos().marcarEliminado(admin, CLIENTES, proveedor);

      expect((await casos().listar(CENTROS_DE_COSTO, {})).total).toBe(0);
    });
  });

  test("una moneda que la base no conoce no pasa en silencio", async () => {
    const centro = await altaDeCentro("Administración");
    const id = await altaDeEgreso(centro);
    await cliente()
      .$executeRaw`UPDATE egresos SET importe_moneda = 'XXX' WHERE id = ${id}::uuid`;

    await expect(casos().obtener(EGRESOS, id)).rejects.toMatchObject({
      codigo: catalogo.INF_0001.codigo,
    });
  });
});
