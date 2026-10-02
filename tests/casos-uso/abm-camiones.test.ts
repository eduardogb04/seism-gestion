/**
 * Lo propio de Camiones (F1-06) contra el Postgres de verdad del arnés: el
 * obligatorio condicional de la cisterna según el tipo, la patente que se
 * guarda normalizada y es única (la de la cisterna solo entre las que la
 * tienen), la antigüedad del listado con el reloj inyectado, y la baja de un
 * cliente que tiene camiones. Lo común a todos los ABM está en `abm.test.ts`.
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
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import { CAMIONES } from "../../src/casos-uso/abm/camiones.ts";
import { CLIENTES } from "../../src/casos-uso/abm/clientes.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

const HOY = crearFechaHora({
  anio: 2031,
  mes: 7,
  dia: 9,
  hora: 10,
  minuto: 30,
  segundo: 0,
  milisegundo: 0,
});

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let admin: Actor;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function casos() {
  if (!HOY.ok) {
    throw new Error(HOY.mensaje);
  }
  return crearCasosUsoAbm({
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY.fechaHora),
    generadorId: crearGeneradorIdCrypto(),
  });
}

async function altaDeCliente(razonSocial: string, cuit: string) {
  const resultado = await casos().crear(admin, CLIENTES, {
    razonSocial,
    cuit,
    condicionIva: "responsable_inscripto",
    domicilio: "Calle Falsa 123",
    localidad: "Ciudad Ejemplo",
    provincia: "cordoba",
    codigoPostal: "X5000",
    esCliente: "si",
  });
  if (!resultado.ok) {
    throw new Error(
      `el alta del cliente no pasó: ${JSON.stringify(resultado.errores)}`,
    );
  }
  return resultado.registro.valor.id;
}

/** Un semi con cisterna válido de ese cliente; cada test cambia lo suyo. */
function escritoDeCamion(clienteId: string, cambios: Escrito = {}): Escrito {
  return {
    clienteId,
    tipo: "semi_con_cisterna",
    patenteTractor: "ZZ001ZZ",
    marcaTractor: "Marca Ejemplo",
    anioTractor: "2018",
    patenteCisterna: "ZZ101ZZ",
    marcaCisterna: "Marca Ejemplo",
    anioCisterna: "2022",
    capacidadLitros: "30000",
    ...cambios,
  };
}

const SIN_CISTERNA = {
  patenteCisterna: "",
  marcaCisterna: "",
  anioCisterna: "",
};

describe("Camiones", () => {
  let clienteUno: string;

  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    const [uno] = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
    if (uno === undefined) {
      throw new Error("falta el usuario sembrado");
    }
    admin = { tipo: "persona", usuarioId: uno.id };
    clienteUno = await altaDeCliente("Empresa Ejemplo Uno S.A.", "30000000015");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const crear = (cambios: Escrito = {}) =>
    casos().crear(admin, CAMIONES, escritoDeCamion(clienteUno, cambios));

  describe("los datos de la cisterna según el tipo", () => {
    test("un semi con cisterna sin los tres datos los pide al lado de cada uno", async () => {
      expect(await crear(SIN_CISTERNA)).toEqual({
        ok: false,
        errores: {
          patenteCisterna: "Escribí la patente de la cisterna.",
          marcaCisterna: "Escribí la marca de la cisterna.",
          anioCisterna: "Escribí el año de fabricación de la cisterna.",
        },
      });
      expect(await crear({ marcaCisterna: "" })).toEqual({
        ok: false,
        errores: { marcaCisterna: "Escribí la marca de la cisterna." },
      });
    });

    test("un chasis con datos de cisterna se rechaza al lado del que viene cargado; sin ellos, se guarda", async () => {
      expect(
        await crear({ tipo: "chasis", ...SIN_CISTERNA, marcaCisterna: "X" }),
      ).toEqual({
        ok: false,
        errores: { marcaCisterna: "Un chasis no lleva datos de cisterna." },
      });
      expect(await crear({ tipo: "chasis" })).toEqual({
        ok: false,
        errores: {
          patenteCisterna: "Un chasis no lleva datos de cisterna.",
          marcaCisterna: "Un chasis no lleva datos de cisterna.",
          anioCisterna: "Un chasis no lleva datos de cisterna.",
        },
      });

      expect(await crear({ tipo: "chasis", ...SIN_CISTERNA })).toMatchObject({
        ok: true,
      });
    });

    test("el tipo otro lleva los datos de cisterna o no, como quiera", async () => {
      expect(await crear({ tipo: "otro" })).toMatchObject({ ok: true });
      expect(
        await crear({
          tipo: "otro",
          patenteTractor: "ZZ002ZZ",
          ...SIN_CISTERNA,
        }),
      ).toMatchObject({ ok: true });
    });
  });

  describe("patentes", () => {
    test("se guardan en mayúsculas, sin espacios ni guiones", async () => {
      const resultado = await crear({
        patenteTractor: " zz 001-zz ",
        patenteCisterna: "zz-101 zz",
      });
      expect(resultado).toMatchObject({
        ok: true,
        registro: {
          valor: { patenteTractor: "ZZ001ZZ", patenteCisterna: "ZZ101ZZ" },
        },
      });
    });

    test("de 6 o 7 letras y números; otra cosa vuelve al lado del campo", async () => {
      expect(await crear({ patenteTractor: "ZZ1" })).toEqual({
        ok: false,
        errores: {
          patenteTractor:
            "La patente tiene 6 o 7 letras y números, sin espacios ni guiones.",
        },
      });
      expect(await crear({ patenteTractor: "" })).toEqual({
        ok: false,
        errores: { patenteTractor: "Escribí la patente del tractor." },
      });
    });

    test("la del tractor no se repite, aunque cambie cómo se escribe; con el primero dado de baja, se puede", async () => {
      const primero = await crear();
      if (!primero.ok) {
        throw new Error("el primer alta tendría que pasar");
      }

      expect(
        await crear({
          patenteTractor: "zz 001 zz",
          patenteCisterna: "ZZ102ZZ",
        }),
      ).toMatchObject({
        ok: false,
        errores: { patenteTractor: expect.stringContaining("DOM-0008") },
      });

      await casos().marcarEliminado(admin, CAMIONES, primero.registro.valor.id);
      expect(await crear()).toMatchObject({ ok: true });
    });

    test("la de la cisterna no se repite, pero dos camiones sin cisterna no chocan entre sí", async () => {
      expect(await crear()).toMatchObject({ ok: true });
      expect(
        await crear({ patenteTractor: "ZZ002ZZ", patenteCisterna: "zz101zz" }),
      ).toMatchObject({
        ok: false,
        errores: { patenteCisterna: expect.stringContaining("DOM-0008") },
      });

      expect(
        await crear({
          tipo: "chasis",
          patenteTractor: "ZZ003ZZ",
          ...SIN_CISTERNA,
        }),
      ).toMatchObject({ ok: true });
      expect(
        await crear({
          tipo: "chasis",
          patenteTractor: "ZZ004ZZ",
          ...SIN_CISTERNA,
        }),
      ).toMatchObject({ ok: true });
    });
  });

  describe("campos numéricos", () => {
    test("los años van de 1950 a 2100 y la capacidad es mayor que 0", async () => {
      expect(
        await crear({
          anioTractor: "1949",
          anioCisterna: "2101",
          capacidadLitros: "0",
        }),
      ).toEqual({
        ok: false,
        errores: {
          anioTractor: "El año va de 1950 a 2100.",
          anioCisterna: "El año va de 1950 a 2100.",
          capacidadLitros: "Tiene que ser mayor que 0.",
        },
      });
    });
  });

  describe("antigüedad en el listado", () => {
    test("es la de la cisterna si la tiene y, si no, la de la unidad, con el año del reloj", async () => {
      await crear();
      await crear({
        tipo: "chasis",
        patenteTractor: "ZZ002ZZ",
        anioTractor: "2030",
        ...SIN_CISTERNA,
      });
      await crear({
        tipo: "otro",
        patenteTractor: "ZZ003ZZ",
        anioTractor: "2031",
        ...SIN_CISTERNA,
      });

      const { registros, celdas } = await casos().listar(CAMIONES, {});
      const antiguedad = Object.fromEntries(
        registros.map(({ valor }) => [
          valor.patenteTractor,
          celdas[valor.id]?.[4],
        ]),
      );

      expect(antiguedad).toEqual({
        ZZ001ZZ: "9 años",
        ZZ002ZZ: "1 año",
        ZZ003ZZ: "0 años",
      });
    });
  });

  describe("baja de un cliente con camiones", () => {
    test("se rechaza con DOM-0010 mientras tenga un camión vigente; con el camión dado de baja, se puede", async () => {
      const camion = await crear();
      if (!camion.ok) {
        throw new Error("el alta tendría que pasar");
      }

      await expect(
        casos().marcarEliminado(admin, CLIENTES, clienteUno),
      ).rejects.toMatchObject({ codigo: "DOM-0010" });

      await casos().marcarEliminado(admin, CAMIONES, camion.registro.valor.id);
      await casos().marcarEliminado(admin, CLIENTES, clienteUno);
    });
  });
});
