/**
 * Lo que F1-05 sumó al molde de ABM, con Sitios como su primer uso, contra el
 * Postgres de verdad del arnés: el campo `numero`, el único compuesto (cliente
 * + nombre), el historial leído de `auditoria` y la baja de un cliente que
 * tiene sitios. Y lo propio de Sitios: las coordenadas.
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
import { crearAuditoriaPrisma } from "../../src/adaptadores/prisma/auditoria.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import { CLIENTES } from "../../src/casos-uso/abm/clientes.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { SITIOS } from "../../src/casos-uso/abm/sitios.ts";
import {
  type Actor,
  crearNombreProceso,
} from "../../src/dominio/compartido/actor.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  ADMIN_UNO,
  OPERADOR,
  sembrarUsuarios,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

/** El 9/7/2031 a las 10:`minuto`: cada escritura de un test ocurre en un minuto distinto. */
function a(minuto: number) {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 10,
    minuto,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let admin: Actor;
let operador: Actor;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function casos(minuto = 30) {
  return crearCasosUsoAbm({
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(a(minuto)),
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

/** Un sitio válido de ese cliente; cada test cambia lo suyo. */
function escritoDeSitio(clienteId: string, cambios: Escrito = {}): Escrito {
  return {
    clienteId,
    nombre: "Planta Ejemplo Norte",
    provincia: "cordoba",
    localidad: "Villa Ejemplo",
    cantidadTanques: "2",
    capacidadTotalLitros: "100000",
    ...cambios,
  };
}

async function altaDeSitio(clienteId: string, cambios: Escrito = {}) {
  const resultado = await casos().crear(
    admin,
    SITIOS,
    escritoDeSitio(clienteId, cambios),
  );
  if (!resultado.ok) {
    throw new Error(
      `el alta del sitio no pasó: ${JSON.stringify(resultado.errores)}`,
    );
  }
  return resultado.registro.valor.id;
}

describe("Sitios y lo que sumó al molde", () => {
  let clienteUno: string;

  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    const [uno, dos] = await sembrarUsuarios(cliente(), [ADMIN_UNO, OPERADOR]);
    if (uno === undefined || dos === undefined) {
      throw new Error("faltan los usuarios sembrados");
    }
    admin = { tipo: "persona", usuarioId: uno.id };
    operador = { tipo: "persona", usuarioId: dos.id };
    clienteUno = await altaDeCliente("Empresa Ejemplo Uno S.A.", "30000000015");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("número", () => {
    test("guarda y lee number; la coma decimal se acepta y lo opcional vacío es null", async () => {
      const id = await altaDeSitio(clienteUno, {
        latitud: "-30,5",
        longitud: "-65.25",
      });
      const sinCoordenadas = await altaDeSitio(clienteUno, {
        nombre: "Planta Ejemplo Sur",
      });

      expect(
        await cliente().sitio.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        latitud: -30.5,
        longitud: -65.25,
        cantidadTanques: 2,
        capacidadTotalLitros: 100000,
      });
      expect(
        await cliente().sitio.findUniqueOrThrow({
          where: { id: sinCoordenadas },
        }),
      ).toMatchObject({ latitud: null, longitud: null, direccion: null });
    });

    test("lo que no es un número, el vacío en un obligatorio y los decimales en un entero vuelven al lado del campo", async () => {
      const filas = await cliente().sitio.count();

      const resultado = await casos().crear(
        admin,
        SITIOS,
        escritoDeSitio(clienteUno, {
          cantidadTanques: "12abc",
          capacidadTotalLitros: "",
          latitud: "1,1234567",
          longitud: "2,5",
        }),
      );
      const conDecimales = await casos().crear(
        admin,
        SITIOS,
        escritoDeSitio(clienteUno, { cantidadTanques: "2,5" }),
      );

      expect(resultado).toEqual({
        ok: false,
        errores: {
          cantidadTanques: "Escribí un número.",
          capacidadTotalLitros: "Escribí un número.",
          latitud: "Hasta 6 decimales.",
        },
      });
      expect(conDecimales).toEqual({
        ok: false,
        errores: {
          cantidadTanques: "Escribí un número entero, sin decimales.",
        },
      });
      expect(await cliente().sitio.count()).toBe(filas);
    });
  });

  describe("lo propio de Sitios", () => {
    test("las coordenadas tienen su rango y van las dos o ninguna", async () => {
      const intento = (cambios: Escrito) =>
        casos().crear(admin, SITIOS, escritoDeSitio(clienteUno, cambios));

      expect(await intento({ latitud: "91", longitud: "10" })).toMatchObject({
        ok: false,
        errores: { latitud: "La latitud va de -90 a 90." },
      });
      expect(await intento({ latitud: "10", longitud: "-181" })).toMatchObject({
        ok: false,
        errores: { longitud: "La longitud va de -180 a 180." },
      });
      expect(await intento({ longitud: "10" })).toMatchObject({
        ok: false,
        errores: { latitud: "Cargá la latitud y la longitud, o ninguna." },
      });
      expect(await intento({ latitud: "10" })).toMatchObject({
        ok: false,
        errores: { latitud: "Cargá la latitud y la longitud, o ninguna." },
      });
      expect(await intento({ latitud: "-90", longitud: "180" })).toMatchObject({
        ok: true,
      });
    });

    test("sin cliente, con uno que no existe o con un número negativo, vuelve en el campo", async () => {
      const intento = (id: string, cambios: Escrito = {}) =>
        casos().crear(admin, SITIOS, escritoDeSitio(id, cambios));

      expect(await intento("")).toEqual({
        ok: false,
        errores: { clienteId: "Elegí un cliente." },
      });
      expect(await intento("2f6c0f66-0b7f-4c34-9a4c-6f7f5d3d1111")).toEqual({
        ok: false,
        errores: { clienteId: "Elegí una de las opciones de la lista." },
      });
      expect(await intento(clienteUno, { cantidadTanques: "-1" })).toEqual({
        ok: false,
        errores: { cantidadTanques: "No puede ser negativo." },
      });
    });
  });

  describe("único compuesto", () => {
    test("el mismo nombre en el mismo cliente se rechaza, aunque cambien las mayúsculas; en otro cliente, o con el primero dado de baja, se puede", async () => {
      const otro = await altaDeCliente(
        "Empresa Ejemplo Dos S.R.L.",
        "30000000023",
      );
      const primero = await altaDeSitio(clienteUno);

      expect(
        await casos().crear(
          admin,
          SITIOS,
          escritoDeSitio(clienteUno, { nombre: "PLANTA ejemplo NORTE" }),
        ),
      ).toEqual({
        ok: false,
        errores: {
          nombre: "Ya hay un sitio con ese nombre para este cliente.",
        },
      });
      expect(
        await casos().crear(admin, SITIOS, escritoDeSitio(otro)),
      ).toMatchObject({ ok: true });

      await casos().marcarEliminado(admin, SITIOS, primero);

      expect(
        await casos().crear(admin, SITIOS, escritoDeSitio(clienteUno)),
      ).toMatchObject({ ok: true });
    });

    test("al editar, el sitio no choca consigo mismo, pero sí con otro del cliente", async () => {
      const norte = await altaDeSitio(clienteUno);
      await altaDeSitio(clienteUno, { nombre: "Planta Ejemplo Sur" });

      expect(
        await casos().guardar(
          admin,
          SITIOS,
          norte,
          escritoDeSitio(clienteUno, { localidad: "Pueblo Ejemplo" }),
        ),
      ).toMatchObject({ ok: true });
      expect(
        await casos().guardar(
          admin,
          SITIOS,
          norte,
          escritoDeSitio(clienteUno, { nombre: "planta ejemplo sur" }),
        ),
      ).toMatchObject({
        ok: false,
        errores: { nombre: expect.stringContaining("Ya hay un sitio") },
      });
    });
  });

  describe("historial", () => {
    test("dos ediciones que cambian la cantidad dan dos filas, con quién y de cuánto a cuánto; lo que no es cantidad o capacidad, no", async () => {
      const id = await altaDeSitio(clienteUno, { cantidadTanques: "2" });
      expect(await casos().historial(SITIOS, id)).toEqual([]);

      await casos(31).guardar(
        admin,
        SITIOS,
        id,
        escritoDeSitio(clienteUno, { cantidadTanques: "3" }),
      );
      await casos(32).guardar(
        operador,
        SITIOS,
        id,
        escritoDeSitio(clienteUno, {
          cantidadTanques: "4",
          capacidadTotalLitros: "120000",
        }),
      );
      await casos(33).guardar(
        admin,
        SITIOS,
        id,
        escritoDeSitio(clienteUno, {
          cantidadTanques: "4",
          capacidadTotalLitros: "120000",
          localidad: "Pueblo Ejemplo",
          observaciones: "Otro dato",
        }),
      );
      await casos(34).guardar(
        admin,
        SITIOS,
        id,
        escritoDeSitio(clienteUno, {
          cantidadTanques: "4",
          capacidadTotalLitros: "120000",
          localidad: "Pueblo Ejemplo",
          observaciones: "Otro dato",
        }),
      );

      expect(await casos().historial(SITIOS, id)).toEqual([
        {
          cuando: "09/07/2031 10:32",
          quien: "operador@ejemplo.test",
          campo: "Cantidad de tanques",
          de: "3",
          a: "4",
        },
        {
          cuando: "09/07/2031 10:32",
          quien: "operador@ejemplo.test",
          campo: "Capacidad total (litros)",
          de: "100.000",
          a: "120.000",
        },
        {
          cuando: "09/07/2031 10:31",
          quien: "admin.a@ejemplo.test",
          campo: "Cantidad de tanques",
          de: "2",
          a: "3",
        },
      ]);
    });

    test("un cambio hecho por un proceso del sistema muestra el nombre del proceso", async () => {
      const id = await altaDeSitio(clienteUno);
      const proceso = crearNombreProceso("ajuste-de-prueba");
      if (!proceso.ok) {
        throw new Error(proceso.error);
      }
      await crearAuditoriaPrisma(cliente()).registrar({
        entidad: "Sitio",
        id: identificadorDesde<string>(id),
        accion: "actualizar",
        antes: { cantidadTanques: 2 },
        despues: { cantidadTanques: 5 },
        actor: { tipo: "sistema", proceso: proceso.valor },
        en: a(40),
      });

      expect(await casos().historial(SITIOS, id)).toMatchObject([
        { quien: "ajuste-de-prueba", de: "2", a: "5" },
      ]);
    });

    test("una entidad que no declara historial no devuelve nada", async () => {
      expect(await casos().historial(CLIENTES, clienteUno)).toEqual([]);
    });
  });

  describe("dar de baja un cliente con sitios", () => {
    test("se rechaza con DOM-0010 mientras tenga un sitio vigente; con el sitio dado de baja, se puede", async () => {
      const sitio = await altaDeSitio(clienteUno);

      await expect(
        casos().marcarEliminado(admin, CLIENTES, clienteUno),
      ).rejects.toMatchObject({ codigo: "DOM-0010" });

      await casos().marcarEliminado(admin, SITIOS, sitio);
      await casos().marcarEliminado(admin, CLIENTES, clienteUno);

      expect(
        (
          await cliente().cliente.findUniqueOrThrow({
            where: { id: clienteUno },
          })
        ).eliminadoEn,
      ).not.toBeNull();
    });
  });
});
