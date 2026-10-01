/**
 * Los tipos de campo que el molde de ABM sumó con Clientes (F1-04), contra el
 * Postgres de verdad del arnés: opción de una lista, casilla de sí/no y
 * relación con otra entidad, más la baja de un registro en uso. Y lo propio de
 * Clientes: "al menos uno", el CUIT, el código postal y la búsqueda.
 *
 * Datos inventados; los CUIT tienen cuerpo `30-0000000x` y dígito calculado.
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
import { CLIENTES } from "../../src/casos-uso/abm/clientes.ts";
import {
  cabecerasDe,
  type Escrito,
} from "../../src/casos-uso/abm/definicion.ts";
import { GRUPOS } from "../../src/casos-uso/abm/grupos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import {
  crearFechaHora,
  type FechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

const HOY: FechaHora = (() => {
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

/** Un cliente completo y válido; cada test cambia lo suyo. */
function escritoDeCliente(cambios: Escrito = {}): Escrito {
  return {
    razonSocial: "Empresa Ejemplo Uno S.A.",
    cuit: "30-00000001-5",
    condicionIva: "responsable_inscripto",
    domicilio: "Calle Falsa 123",
    localidad: "Ciudad Ejemplo",
    provincia: "cordoba",
    codigoPostal: "x5000",
    esCliente: "si",
    ...cambios,
  };
}

async function altaDeCliente(cambios: Escrito = {}): Promise<string> {
  const resultado = await casos().crear(
    admin,
    CLIENTES,
    escritoDeCliente(cambios),
  );
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.registro.valor.id;
}

async function altaDeGrupo(nombre: string): Promise<string> {
  const resultado = await casos().crear(admin, GRUPOS, {
    nombre,
    observaciones: "",
  });
  if (!resultado.ok) {
    throw new Error(`el alta del grupo "${nombre}" no pasó`);
  }
  return resultado.registro.valor.id;
}

/** Cuántas filas hay en `clientes` y en `auditoria`: lo que una escritura rechazada no puede mover. */
async function filas() {
  return {
    clientes: await cliente().cliente.count(),
    auditoria: await cliente().auditoria.count(),
  };
}

describe("tipos de campo del molde, con Clientes", () => {
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

  describe("opción", () => {
    test("un valor fuera de la lista vuelve con el mensaje en el campo y no escribe nada", async () => {
      const antes = await filas();

      const resultado = await casos().crear(
        admin,
        CLIENTES,
        escritoDeCliente({ condicionIva: "otra", provincia: "" }),
      );

      expect(resultado).toEqual({
        ok: false,
        errores: {
          condicionIva: "Elegí una de las opciones de la lista.",
          provincia: "Elegí una de las opciones de la lista.",
        },
      });
      expect(await filas()).toEqual(antes);
    });
  });

  describe("sí/no", () => {
    test("guarda y lee true y false", async () => {
      const id = await altaDeCliente({ esProveedor: "si" });
      const guardado = await cliente().cliente.findUniqueOrThrow({
        where: { id },
      });
      expect(guardado).toMatchObject({ esCliente: true, esProveedor: true });

      const resultado = await casos().guardar(
        admin,
        CLIENTES,
        id,
        escritoDeCliente({ esCliente: "", esProveedor: "si" }),
      );

      expect(resultado.ok).toBe(true);
      expect(
        await cliente().cliente.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ esCliente: false, esProveedor: true });
    });

    test("ninguna de las dos casillas vuelve con el mensaje al lado de esCliente y no escribe nada", async () => {
      const antes = await filas();

      const resultado = await casos().crear(
        admin,
        CLIENTES,
        escritoDeCliente({ esCliente: "" }),
      );

      expect(resultado).toEqual({
        ok: false,
        errores: {
          esCliente: "Marcá si es cliente, proveedor o las dos cosas.",
        },
      });
      expect(await filas()).toEqual(antes);
    });
  });

  describe("relación", () => {
    test("un grupo que no existe, que no es un id o que está dado de baja vuelve con el mensaje en el campo", async () => {
      const dadoDeBaja = await altaDeGrupo("Grupo Viejo");
      await casos().marcarEliminado(admin, GRUPOS, dadoDeBaja);
      const antes = await filas();

      for (const grupoId of [
        "2f6c0f66-0b7f-4c34-9a4c-6f7f5d3d1111",
        "no-soy-un-id",
        dadoDeBaja,
      ]) {
        const resultado = await casos().crear(
          admin,
          CLIENTES,
          escritoDeCliente({ grupoId }),
        );

        expect(resultado, grupoId).toEqual({
          ok: false,
          errores: { grupoId: "Elegí una de las opciones de la lista." },
        });
      }
      expect(await filas()).toEqual(antes);
    });

    test("sin grupo se guarda null; con grupo, su id", async () => {
      const grupoId = await altaDeGrupo("Grupo Norte");

      const sinGrupo = await altaDeCliente({ grupoId: "" });
      const conGrupo = await altaDeCliente({
        razonSocial: "Empresa Ejemplo Dos S.R.L.",
        cuit: "30000000023",
        grupoId,
      });

      expect(
        await cliente().cliente.findUniqueOrThrow({ where: { id: sinGrupo } }),
      ).toMatchObject({ grupoId: null });
      expect(
        await cliente().cliente.findUniqueOrThrow({ where: { id: conGrupo } }),
      ).toMatchObject({ grupoId });
    });

    test("el selector ofrece los grupos vigentes, por nombre: uno dado de baja no aparece", async () => {
      await altaDeGrupo("Grupo Sur");
      await altaDeGrupo("Grupo Este");
      const dadoDeBaja = await altaDeGrupo("Grupo Centro");
      await casos().marcarEliminado(admin, GRUPOS, dadoDeBaja);

      const opciones = await casos().opciones(CLIENTES);

      expect(Object.keys(opciones)).toEqual(["grupoId"]);
      expect(opciones.grupoId?.map(({ texto }) => texto)).toEqual([
        "Grupo Este",
        "Grupo Sur",
      ]);
      expect(await casos().opciones(GRUPOS)).toEqual({});
    });

    test("el listado trae lo que se muestra de cada relación, con las etiquetas de la lista", async () => {
      const grupoId = await altaDeGrupo("Grupo Norte");
      await altaDeCliente({ grupoId });
      await altaDeCliente({
        razonSocial: "Proveedora Ejemplo Cinco S.A.",
        cuit: "30000000058",
        condicionIva: "monotributo",
        esCliente: "",
        esProveedor: "si",
      });

      const listado = await casos().listar(CLIENTES, {});

      expect(cabecerasDe(CLIENTES)).toEqual([
        "Razón social",
        "CUIT",
        "Condición frente al IVA",
        "Grupo",
        "Tipo",
      ]);
      expect(
        listado.registros.map(({ valor }) => listado.celdas[valor.id]),
      ).toEqual([
        [
          "Empresa Ejemplo Uno S.A.",
          "30-00000001-5",
          "Responsable Inscripto",
          "Grupo Norte",
          "Cliente",
        ],
        [
          "Proveedora Ejemplo Cinco S.A.",
          "30-00000005-8",
          "Monotributo",
          "",
          "Proveedor",
        ],
      ]);
    });
  });

  describe("dar de baja un registro en uso", () => {
    test("un grupo con clientes vigentes se rechaza con DOM-0010 y no deja auditoría; con el cliente dado de baja se puede", async () => {
      const grupoId = await altaDeGrupo("Grupo Norte");
      const clienteId = await altaDeCliente({ grupoId });
      const antes = await filas();

      await expect(
        casos().marcarEliminado(admin, GRUPOS, grupoId),
      ).rejects.toMatchObject({ codigo: "DOM-0010" });

      expect(await filas()).toEqual(antes);
      expect(
        (await cliente().grupo.findUniqueOrThrow({ where: { id: grupoId } }))
          .eliminadoEn,
      ).toBeNull();

      await casos().marcarEliminado(admin, CLIENTES, clienteId);
      await casos().marcarEliminado(admin, GRUPOS, grupoId);

      expect(
        (await cliente().grupo.findUniqueOrThrow({ where: { id: grupoId } }))
          .eliminadoEn,
      ).not.toBeNull();
    });
  });

  describe("lo propio de Clientes", () => {
    test("guarda el CUIT sin guiones, el código postal en mayúsculas y lo opcional vacío como null", async () => {
      const id = await altaDeCliente({
        nombreCorto: "  ",
        contactoEmail: "",
      });

      expect(
        await cliente().cliente.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        cuit: "30000000015",
        codigoPostal: "X5000",
        nombreCorto: null,
        contactoEmail: null,
        grupoId: null,
        observaciones: null,
      });
    });

    test("un CUIT inválido, un código postal corto y un email mal escrito vuelven al lado de su campo", async () => {
      const resultado = await casos().crear(
        admin,
        CLIENTES,
        escritoDeCliente({
          cuit: "30-00000001-6",
          codigoPostal: "50",
          contactoEmail: "no-es-un-email",
          emailFacturacion: "facturas@ejemplo.test",
        }),
      );

      expect(resultado).toEqual({
        ok: false,
        errores: {
          cuit: "El CUIT no es válido: son 11 dígitos y el último es un verificador.",
          codigoPostal: "El código postal tiene entre 4 y 8 letras o números.",
          contactoEmail: "Escribí un email válido.",
        },
      });
    });

    test("el CUIT y la razón social son únicos aunque se escriban distinto: con o sin guiones, con otras mayúsculas", async () => {
      await altaDeCliente();

      const mismoCuit = await casos().crear(
        admin,
        CLIENTES,
        escritoDeCliente({
          razonSocial: "Otra Empresa Ejemplo S.A.",
          cuit: "30000000015",
        }),
      );
      const mismaRazon = await casos().crear(
        admin,
        CLIENTES,
        escritoDeCliente({
          razonSocial: "EMPRESA EJEMPLO UNO s.a.",
          cuit: "30-00000002-3",
        }),
      );

      expect(mismoCuit).toEqual({
        ok: false,
        errores: { cuit: expect.stringContaining("DOM-0008") },
      });
      expect(mismaRazon).toEqual({
        ok: false,
        errores: { razonSocial: expect.stringContaining("DOM-0008") },
      });
    });

    test("se busca por razón social, nombre corto o CUIT, con o sin guiones", async () => {
      await altaDeCliente({ nombreCorto: "Ejemplo Uno" });
      await altaDeCliente({
        razonSocial: "Empresa Ejemplo Dos S.R.L.",
        cuit: "30000000023",
      });

      const buscar = async (texto: string) =>
        (await casos().listar(CLIENTES, { buscar: texto })).registros.map(
          ({ valor }) => valor.cuit,
        );

      expect(await buscar("30-0000")).toEqual(["30000000023", "30000000015"]);
      expect(await buscar("300000")).toEqual(["30000000023", "30000000015"]);
      expect(await buscar("30-00000002")).toEqual(["30000000023"]);
      expect(await buscar("ejemplo UNO")).toEqual(["30000000015"]);
      expect(await buscar("dos s.r.l")).toEqual(["30000000023"]);
      expect(await buscar("nada")).toEqual([]);
    });
  });
});
