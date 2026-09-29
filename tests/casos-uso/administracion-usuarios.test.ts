/**
 * Lo que F0-32 suma a los casos de uso de usuarios, contra el Postgres de
 * verdad del arnés:
 *
 * - `listar(actor)`: todos los usuarios (también los revocados), por email;
 *   solo un administrador activo (`AUT-0003` si no).
 * - Un email que no está en la lista, al intentar entrar, recibe `AUT-0001`
 *   y no se crea ningún registro (criterio 5; F0-31 ya lo probaba para las
 *   sesiones, acá se cuentan también usuarios y auditoría).
 * - R3: revocar o cambiar el rol **invalida en el mismo proceso** la caché de
 *   sesiones de ese usuario. Con el reloj fijo (sin avanzar los 30 s de la
 *   caché), la sesión de una persona revocada deja de validar enseguida
 *   (`AUT-0002`). Lo que no cambió no se invalida: un intento rechazado
 *   (`AUT-0003`, `AUT-0004`) ni el usuario de al lado.
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
import { crearCasosUsoSesion } from "../../src/casos-uso/sesion/sesion.ts";
import { crearCasosUsoUsuarios } from "../../src/casos-uso/usuarios/usuarios.ts";
import {
  type Actor,
  crearNombreProceso,
} from "../../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../../src/dominio/compartido/auditable.ts";
import {
  type Identificador,
  identificadorDesde,
} from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  type FechaHora,
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

function fecha(hora: number): FechaHora {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 5,
    dia: 14,
    hora,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const generadorId = crearGeneradorIdCrypto();
const RELOJ = RelojFijo(fecha(10));

function persona(usuarioId: Identificador<"Usuario">): Actor {
  return { tipo: "persona", usuarioId };
}

function proceso(nombre: string): Actor {
  const resultado = crearNombreProceso(nombre);
  if (!resultado.ok) {
    throw new Error(resultado.error);
  }
  return { tipo: "sistema", proceso: resultado.valor };
}

async function existente(
  email: string,
  rol: Rol,
  estado: EstadoUsuario = "activo",
): Promise<Identificador<"Usuario">> {
  const id = identificadorDesde<"Usuario">(generadorId.generar());
  const actor = proceso("preparacion-test");
  await crearRepositorioUsuariosPrisma(cliente()).crear(
    actor,
    crearAuditable(
      { id, email, nombre: null, rol, estado },
      actor,
      RelojFijo(fecha(8)),
    ),
  );
  return id;
}

function identidad(email: string): IdentidadVerificada {
  return {
    proveedor: "falsa",
    sub: `falsa:${email}`,
    email,
    emailVerificado: true,
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

/** Sesión y usuarios armados como los arma la app: la caché de sesiones es una sola. */
function armar() {
  const transaccional = transaccionalContado();
  const sesion = crearCasosUsoSesion({ transaccional, reloj: RELOJ });
  const usuarios = crearCasosUsoUsuarios({
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RELOJ,
    generadorId,
    sesiones: sesion,
  });
  return { transaccional, sesion, usuarios };
}

describe("casos de uso de usuarios de la pantalla de administración", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("listar", () => {
    test("un administrador ve a todos, también a los revocados, ordenados por email", async () => {
      const admin = await existente("m-admin@ejemplo.test", "administrador");
      await existente("z-operador@ejemplo.test", "operador");
      await existente("b-revocada@ejemplo.test", "operador", "revocado");
      const { usuarios } = armar();

      const lista = await usuarios.listar(persona(admin));

      expect(
        lista.map(({ valor }) => [valor.email, valor.rol, valor.estado]),
      ).toEqual([
        ["b-revocada@ejemplo.test", "operador", "revocado"],
        ["m-admin@ejemplo.test", "administrador", "activo"],
        ["z-operador@ejemplo.test", "operador", "activo"],
      ]);
    });

    test("un operador, un administrador revocado y un proceso del sistema reciben AUT-0003", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const operador = await existente("operador@ejemplo.test", "operador");
      const revocado = await existente(
        "ex-admin@ejemplo.test",
        "administrador",
        "revocado",
      );
      const { usuarios } = armar();

      for (const actor of [
        persona(operador),
        persona(revocado),
        proceso("prueba-listado"),
      ]) {
        await expect(usuarios.listar(actor)).rejects.toMatchObject({
          codigo: "AUT-0003",
        });
      }
    });
  });

  describe("un email que no está en la lista", () => {
    test("al intentar entrar recibe AUT-0001 y no se crea ningún registro: ni usuario, ni sesión, ni auditoría", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const { sesion } = armar();
      const contar = async () => ({
        usuarios: await cliente().usuario.count(),
        sesiones: await cliente().sesion.count(),
        auditoria: await cliente().auditoria.count(),
      });
      const antes = await contar();

      await expect(
        sesion.completarSesion(identidad("nadie@ejemplo.test"), null),
      ).rejects.toMatchObject({ codigo: "AUT-0001" });

      expect(await contar()).toEqual(antes);
    });
  });

  describe("R3: revocar y cambiar el rol cortan la caché de sesiones de ese usuario", () => {
    test("revocar y validar enseguida, sin avanzar el reloj, es AUT-0002", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const operadora = await existente("operadora@ejemplo.test", "operador");
      const { sesion, usuarios } = armar();
      const abierta = await sesion.completarSesion(
        identidad("operadora@ejemplo.test"),
        null,
      );
      await expect(sesion.validarSesion(abierta.id)).resolves.toMatchObject({
        sesionId: abierta.id,
      });

      await usuarios.revocar(persona(admin), operadora);

      await expect(sesion.validarSesion(abierta.id)).rejects.toMatchObject({
        codigo: "AUT-0002",
      });
    });

    test("cambiar el rol se ve enseguida en la sesión: no queda el rol viejo en la caché", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const otra = await existente("otra@ejemplo.test", "administrador");
      const { sesion, usuarios } = armar();
      const abierta = await sesion.completarSesion(
        identidad("otra@ejemplo.test"),
        null,
      );
      await expect(sesion.validarSesion(abierta.id)).resolves.toMatchObject({
        usuario: { rol: "administrador" },
      });

      await usuarios.cambiarRol(persona(admin), otra, "operador");

      await expect(sesion.validarSesion(abierta.id)).resolves.toMatchObject({
        usuario: { rol: "operador" },
      });
    });

    test("la caché de los demás usuarios no se toca", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const operadora = await existente("operadora@ejemplo.test", "operador");
      await existente("vecino@ejemplo.test", "operador");
      const { sesion, usuarios, transaccional } = armar();
      const deLaVecina = await sesion.completarSesion(
        identidad("vecino@ejemplo.test"),
        null,
      );
      await sesion.validarSesion(deLaVecina.id);
      const consultas = transaccional.consultas();

      await usuarios.revocar(persona(admin), operadora);
      await sesion.validarSesion(deLaVecina.id);

      expect(transaccional.consultas()).toBe(consultas);
    });

    test("un intento rechazado (AUT-0003 y AUT-0004) no invalida nada", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const operadora = await existente("operadora@ejemplo.test", "operador");
      const { sesion, usuarios, transaccional } = armar();
      const deLaOperadora = await sesion.completarSesion(
        identidad("operadora@ejemplo.test"),
        null,
      );
      const deAdmin = await sesion.completarSesion(
        identidad("admin@ejemplo.test"),
        null,
      );
      await sesion.validarSesion(deLaOperadora.id);
      await sesion.validarSesion(deAdmin.id);
      const consultas = transaccional.consultas();

      await expect(
        usuarios.revocar(persona(operadora), admin),
      ).rejects.toMatchObject({ codigo: "AUT-0003" });
      await expect(
        usuarios.revocar(persona(admin), admin),
      ).rejects.toMatchObject({ codigo: "AUT-0004" });
      await sesion.validarSesion(deLaOperadora.id);
      await sesion.validarSesion(deAdmin.id);

      expect(transaccional.consultas()).toBe(consultas);
    });
  });
});
