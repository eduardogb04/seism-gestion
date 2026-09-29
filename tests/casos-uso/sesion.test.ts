/**
 * El flujo de sesión (F0-31, R7) contra el Postgres de verdad del arnés de
 * casos de uso:
 *
 * - `completarSesion`: un email que no es un usuario **activo** rebota con
 *   `AUT-0001` y **no** se crea ninguna fila en `sesiones` (se cuentan antes y
 *   después); uno activo abre una sesión de 12 horas con el token de 256 bits
 *   de F0-30. El email no distingue mayúsculas.
 * - `validarSesion` va **contra la base**, con una caché de 30 s como máximo,
 *   medida con el reloj inyectado: (a) dentro de los 30 s no consulta de
 *   nuevo; (b) a los 30 s sí; (c) un usuario revocado **con el caso de uso de
 *   F0-30** deja de validar a más tardar 30 s después. Vencida o inexistente:
 *   `AUT-0002`.
 * - `cerrarSesion` la quita de la base y de la caché.
 * - `sesionDesdeCookie`: el helper que usa la app para "la sesión actual".
 *
 * Datos inventados (`@ejemplo.test`). Necesita Docker corriendo.
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
import { crearRepositorioUsuariosPrisma } from "../../src/adaptadores/prisma/usuarios.ts";
import {
  crearCasosUsoSesion,
  sesionDesdeCookie,
} from "../../src/casos-uso/sesion/sesion.ts";
import { crearCasosUsoUsuarios } from "../../src/casos-uso/usuarios/usuarios.ts";
import { crearNombreProceso } from "../../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../../src/dominio/compartido/auditable.ts";
import {
  type Identificador,
  identificadorDesde,
} from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  type FechaHora,
  type Reloj,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type { IdentidadVerificada } from "../../src/puertos/identidad.ts";
import type { Transaccional } from "../../src/puertos/repositorios/transaccion.ts";
import type {
  EstadoUsuario,
  Rol,
} from "../../src/puertos/repositorios/usuarios.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function fecha(hora: number, minuto = 0, segundo = 0, ms = 0): FechaHora {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 5,
    dia: 14,
    hora,
    minuto,
    segundo,
    milisegundo: ms,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

/** Un reloj que el test mueve a mano. */
function relojManual(inicio: FechaHora): Reloj & { en(f: FechaHora): void } {
  let actual = inicio;
  return {
    ahora: () => actual,
    en(f) {
      actual = f;
    },
  };
}

/** El `Transaccional` de Prisma, contando cuántas veces se fue a la base. */
function transaccionalContado(): Transaccional & { consultas(): number } {
  const real = crearTransaccionalPrisma(cliente());
  let consultas = 0;
  return {
    ejecutar(trabajo) {
      consultas += 1;
      return real.ejecutar(trabajo);
    },
    consultas: () => consultas,
  };
}

const generadorId = crearGeneradorIdCrypto();

function preparacion() {
  const resultado = crearNombreProceso("preparacion-test");
  if (!resultado.ok) {
    throw new Error(resultado.error);
  }
  return { tipo: "sistema" as const, proceso: resultado.valor };
}

/** Un usuario escrito directo con el repositorio. */
async function existente(
  email: string,
  rol: Rol = "operador",
  estado: EstadoUsuario = "activo",
): Promise<Identificador<"Usuario">> {
  const id = identificadorDesde<"Usuario">(generadorId.generar());
  await crearRepositorioUsuariosPrisma(cliente()).crear(
    crearAuditable(
      { id, email, nombre: null, rol, estado },
      preparacion(),
      RelojFijo(fecha(8)),
    ),
  );
  return id;
}

function identidad(email: string, emailVerificado = true): IdentidadVerificada {
  return { proveedor: "falsa", sub: `falsa:${email}`, email, emailVerificado };
}

async function filasDeSesiones(): Promise<number> {
  return cliente().sesion.count();
}

describe("casos de uso de sesión", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("completarSesion", () => {
    test("un email que no es usuario rebota con AUT-0001 y no crea ninguna sesión", async () => {
      await existente("otra@ejemplo.test");
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      });
      const antes = await filasDeSesiones();

      await expect(
        casos.completarSesion(identidad("nadie@ejemplo.test"), null),
      ).rejects.toMatchObject({ codigo: "AUT-0001" });

      expect(antes).toBe(0);
      expect(await filasDeSesiones()).toBe(antes);
    });

    test("un usuario revocado rebota con AUT-0001 y no crea ninguna sesión", async () => {
      await existente("revocada@ejemplo.test", "operador", "revocado");
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      });
      const antes = await filasDeSesiones();

      await expect(
        casos.completarSesion(identidad("revocada@ejemplo.test"), null),
      ).rejects.toMatchObject({ codigo: "AUT-0001" });

      expect(await filasDeSesiones()).toBe(antes);
    });

    test("una identidad con el email sin verificar rebota con AUT-0001 aunque el usuario esté activo", async () => {
      await existente("activa@ejemplo.test");
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      });

      await expect(
        casos.completarSesion(identidad("activa@ejemplo.test", false), null),
      ).rejects.toMatchObject({ codigo: "AUT-0001" });

      expect(await filasDeSesiones()).toBe(0);
    });

    test("un usuario activo (sin distinguir mayúsculas) abre una sesión de 12 horas con token de 256 bits", async () => {
      const id = await existente("activa@ejemplo.test");
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10, 30)),
      });

      const sesion = await casos.completarSesion(
        identidad("  Activa@Ejemplo.TEST "),
        "NavegadorInventado/1.0",
      );

      expect(sesion.usuarioId).toBe(id);
      expect(sesion.id).toMatch(/^[\w-]{43}$/);
      expect(sesion.creadaEn).toEqual(fecha(10, 30));
      expect(sesion.expiraEn).toEqual(fecha(22, 30));
      expect(sesion.agente).toBe("NavegadorInventado/1.0");
      expect(await filasDeSesiones()).toBe(1);
    });
  });

  describe("validarSesion", () => {
    test("devuelve la sesión con su usuario, leída de la base", async () => {
      const id = await existente("activa@ejemplo.test", "administrador");
      const reloj = relojManual(fecha(10));
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj,
      });
      const sesion = await casos.completarSesion(
        identidad("activa@ejemplo.test"),
        null,
      );

      expect(await casos.validarSesion(sesion.id)).toEqual({
        sesionId: sesion.id,
        expiraEn: fecha(22),
        usuario: {
          id,
          email: "activa@ejemplo.test",
          nombre: null,
          rol: "administrador",
        },
      });
    });

    test("(a) dentro de los 30 s no vuelve a la base; (b) a los 30 s sí", async () => {
      await existente("activa@ejemplo.test");
      const reloj = relojManual(fecha(10));
      const transaccional = transaccionalContado();
      const casos = crearCasosUsoSesion({ transaccional, reloj });
      const sesion = await casos.completarSesion(
        identidad("activa@ejemplo.test"),
        null,
      );
      const trasAbrir = transaccional.consultas();

      await casos.validarSesion(sesion.id);
      expect(transaccional.consultas()).toBe(trasAbrir + 1);

      reloj.en(fecha(10, 0, 29, 999));
      await casos.validarSesion(sesion.id);
      expect(transaccional.consultas()).toBe(trasAbrir + 1);

      reloj.en(fecha(10, 0, 30));
      await casos.validarSesion(sesion.id);
      expect(transaccional.consultas()).toBe(trasAbrir + 2);
    });

    test("(c) un usuario revocado con el caso de uso de F0-30 deja de validar a más tardar 30 s después", async () => {
      const administradora = await existente(
        "admin@ejemplo.test",
        "administrador",
      );
      const operadora = await existente("operadora@ejemplo.test");
      const reloj = relojManual(fecha(10));
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj,
      });
      const sesion = await casos.completarSesion(
        identidad("operadora@ejemplo.test"),
        null,
      );
      await casos.validarSesion(sesion.id);

      await crearCasosUsoUsuarios({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10, 0, 5)),
        generadorId,
        // Otro proceso: no comparte la caché de esta sesión (ADR 0028).
        sesiones: { invalidarUsuario: () => undefined },
      }).revocar({ tipo: "persona", usuarioId: administradora }, operadora);

      reloj.en(fecha(10, 0, 20));
      await expect(casos.validarSesion(sesion.id)).resolves.toMatchObject({
        sesionId: sesion.id,
      });

      reloj.en(fecha(10, 0, 30));
      await expect(casos.validarSesion(sesion.id)).rejects.toMatchObject({
        codigo: "AUT-0002",
      });
    });

    test("una sesión vencida leída de la base (sin caché) es AUT-0002", async () => {
      await existente("activa@ejemplo.test");
      const abierta = await crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      }).completarSesion(identidad("activa@ejemplo.test"), null);
      const otroProceso = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(22)),
      });

      await expect(otroProceso.validarSesion(abierta.id)).rejects.toMatchObject(
        { codigo: "AUT-0002" },
      );
    });

    test("una sesión inexistente es AUT-0002", async () => {
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      });

      await expect(
        casos.validarSesion("token-que-no-existe"),
      ).rejects.toMatchObject({ codigo: "AUT-0002" });
    });

    test("una sesión vencida es AUT-0002, aunque esté en la caché", async () => {
      await existente("activa@ejemplo.test");
      const reloj = relojManual(fecha(10));
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj,
      });
      const sesion = await casos.completarSesion(
        identidad("activa@ejemplo.test"),
        null,
      );

      reloj.en(fecha(21, 59, 50));
      await casos.validarSesion(sesion.id);

      reloj.en(fecha(22));
      await expect(casos.validarSesion(sesion.id)).rejects.toMatchObject({
        codigo: "AUT-0002",
      });
    });

    test("un usuario revocado sin pasar por el caso de uso (sesión que quedó) tampoco valida", async () => {
      const id = await existente("activa@ejemplo.test");
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      });
      const sesion = await casos.completarSesion(
        identidad("activa@ejemplo.test"),
        null,
      );
      await cliente().usuario.update({
        where: { id },
        data: { estado: "revocado" },
      });

      await expect(casos.validarSesion(sesion.id)).rejects.toMatchObject({
        codigo: "AUT-0002",
      });
    });
  });

  describe("cerrarSesion", () => {
    test("quita la sesión de la base y de la caché: deja de validar en el acto", async () => {
      await existente("activa@ejemplo.test");
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      });
      const sesion = await casos.completarSesion(
        identidad("activa@ejemplo.test"),
        null,
      );
      await casos.validarSesion(sesion.id);

      await casos.cerrarSesion(sesion.id);

      expect(await filasDeSesiones()).toBe(0);
      await expect(casos.validarSesion(sesion.id)).rejects.toMatchObject({
        codigo: "AUT-0002",
      });
    });
  });

  describe("sesionDesdeCookie (el helper de la sesión actual)", () => {
    test("sin cookie, o con una sesión que no valida, no hay sesión actual", async () => {
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      });

      expect(await sesionDesdeCookie(undefined, casos)).toBeNull();
      expect(await sesionDesdeCookie("", casos)).toBeNull();
      expect(await sesionDesdeCookie("token-que-no-existe", casos)).toBeNull();
    });

    test("con la cookie de una sesión válida, devuelve quién es", async () => {
      await existente("activa@ejemplo.test");
      const casos = crearCasosUsoSesion({
        transaccional: crearTransaccionalPrisma(cliente()),
        reloj: RelojFijo(fecha(10)),
      });
      const sesion = await casos.completarSesion(
        identidad("activa@ejemplo.test"),
        null,
      );

      expect(await sesionDesdeCookie(sesion.id, casos)).toMatchObject({
        usuario: { email: "activa@ejemplo.test" },
      });
    });
  });
});
