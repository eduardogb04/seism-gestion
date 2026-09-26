/**
 * Los casos de uso de usuarios (F0-30) contra el Postgres de verdad del arnés
 * de casos de uso, una prueba (o más) por regla:
 *
 * - (a) Solo un administrador **activo** y **persona** puede dar de alta,
 *   revocar o cambiar el rol; si no, `AUT-0003` y nada cambia.
 * - (b) `revocar` pone `estado = revocado`, cierra **todas** las sesiones del
 *   usuario y escribe la auditoría en **una** transacción: si algo falla
 *   después de cerrar las sesiones, no queda nada hecho.
 * - (c) Revocar o pasar a operador al **último administrador activo** es
 *   `AUT-0004`, sea uno mismo o sea otro (dos administradores que se revocan
 *   al mismo tiempo).
 * - (d) Alta, revocación y cambio de rol escriben cada uno un
 *   `RegistroAuditoria` con `antes` y `despues`.
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
import { crearRepositorioSesionesPrisma } from "../../src/adaptadores/prisma/sesiones.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearRepositorioUsuariosPrisma } from "../../src/adaptadores/prisma/usuarios.ts";
import { crearCasosUsoUsuarios } from "../../src/casos-uso/usuarios/usuarios.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { crearNombreProceso } from "../../src/dominio/compartido/actor.ts";
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
import type { Sesion } from "../../src/puertos/repositorios/sesiones.ts";
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

function fecha(dia: number): FechaHora {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 5,
    dia,
    hora: 11,
    minuto: 20,
    segundo: 0,
    milisegundo: 250,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const AHORA = fecha(14);
const generadorId = crearGeneradorIdCrypto();

function casosDeUso(transaccional?: Transaccional) {
  return crearCasosUsoUsuarios({
    transaccional: transaccional ?? crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(AHORA),
    generadorId,
  });
}

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

/** Un usuario escrito directo con el repositorio, sin pasar por los casos de uso. */
async function existente(
  email: string,
  rol: Rol,
  estado: EstadoUsuario = "activo",
): Promise<Identificador<"Usuario">> {
  const id = identificadorDesde<"Usuario">(generadorId.generar());
  await crearRepositorioUsuariosPrisma(cliente()).crear(
    crearAuditable(
      { id, email, nombre: null, rol, estado },
      proceso("preparacion-test"),
      RelojFijo(fecha(1)),
    ),
  );
  return id;
}

async function sesionDe(usuarioId: Identificador<"Usuario">): Promise<Sesion> {
  return crearRepositorioSesionesPrisma(cliente()).abrir({
    usuarioId,
    creadaEn: fecha(2),
    expiraEn: fecha(20),
    agente: "NavegadorInventado/1.0",
  });
}

async function usuario(id: Identificador<"Usuario">) {
  return crearRepositorioUsuariosPrisma(cliente()).buscarPorId(id);
}

/** Todo lo que un caso de uso puede tocar, para comparar antes y después. */
async function fotoDeLaBase() {
  const db = cliente();
  return {
    usuarios: await db.usuario.findMany({ orderBy: { email: "asc" } }),
    sesiones: await db.sesion.findMany({ orderBy: { id: "asc" } }),
    auditoria: await db.auditoria.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("casos de uso de usuarios", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("(a) solo un administrador activo puede ejecutarlos (AUT-0003)", () => {
    test("un operador no puede dar de alta, revocar ni cambiar el rol, y nada cambia", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const operador = await existente("operador@ejemplo.test", "operador");
      const otro = await existente("otro@ejemplo.test", "operador");
      await sesionDe(otro);
      const antes = await fotoDeLaBase();
      const casos = casosDeUso();

      await expect(
        casos.darDeAlta(persona(operador), "nuevo@ejemplo.test", "operador"),
      ).rejects.toMatchObject({ codigo: "AUT-0003" });
      await expect(
        casos.revocar(persona(operador), otro),
      ).rejects.toMatchObject({
        codigo: "AUT-0003",
      });
      await expect(
        casos.cambiarRol(persona(operador), otro, "administrador"),
      ).rejects.toMatchObject({ codigo: "AUT-0003" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("un administrador revocado tampoco: mira el estado, no solo el rol", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const revocado = await existente(
        "ex.admin@ejemplo.test",
        "administrador",
        "revocado",
      );
      const otro = await existente("otro@ejemplo.test", "operador");
      const antes = await fotoDeLaBase();
      const casos = casosDeUso();

      await expect(
        casos.darDeAlta(persona(revocado), "nuevo@ejemplo.test", "operador"),
      ).rejects.toMatchObject({ codigo: "AUT-0003" });
      await expect(
        casos.revocar(persona(revocado), otro),
      ).rejects.toMatchObject({
        codigo: "AUT-0003",
      });
      await expect(
        casos.cambiarRol(persona(revocado), otro, "administrador"),
      ).rejects.toMatchObject({ codigo: "AUT-0003" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("un proceso del sistema no puede: el primer administrador lo crea db:seed por otro camino", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const antes = await fotoDeLaBase();

      await expect(
        casosDeUso().darDeAlta(
          proceso("db-seed"),
          "nuevo@ejemplo.test",
          "administrador",
        ),
      ).rejects.toMatchObject({ codigo: "AUT-0003" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("una persona que no es un usuario tampoco", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const antes = await fotoDeLaBase();
      const inexistente = identificadorDesde<"Usuario">(generadorId.generar());

      await expect(
        casosDeUso().darDeAlta(
          persona(inexistente),
          "nuevo@ejemplo.test",
          "operador",
        ),
      ).rejects.toMatchObject({ codigo: "AUT-0003" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });
  });

  describe("darDeAlta", () => {
    test("crea el usuario activo, con el email en minúsculas, el actor y la fecha del reloj", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");

      const alta = await casosDeUso().darDeAlta(
        persona(admin),
        "  Nueva.Persona@Ejemplo.TEST ",
        "operador",
      );

      expect(alta.valor).toMatchObject({
        email: "nueva.persona@ejemplo.test",
        nombre: null,
        rol: "operador",
        estado: "activo",
      });
      expect(alta.creadoPor).toEqual(persona(admin));
      expect(alta.creadoEn).toEqual(AHORA);
      expect(await usuario(alta.valor.id)).toEqual(alta);
    });

    test("el email no distingue mayúsculas: A@ y a@ son el mismo usuario (AUT-0005)", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const casos = casosDeUso();
      await casos.darDeAlta(persona(admin), "A@ejemplo.test", "operador");
      const antes = await fotoDeLaBase();

      await expect(
        casos.darDeAlta(persona(admin), "a@ejemplo.test", "operador"),
      ).rejects.toMatchObject({ codigo: "AUT-0005" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test.each([
      "",
      "sin-arroba",
      "dos@@ejemplo.test",
      "con espacio@ejemplo.test",
      "@ejemplo.test",
      "nadie@",
      "nadie@sin-punto",
    ])("rechaza el email %j (AUT-0007) sin escribir nada", async (email) => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const antes = await fotoDeLaBase();

      await expect(
        casosDeUso().darDeAlta(persona(admin), email, "operador"),
      ).rejects.toMatchObject({ codigo: "AUT-0007" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });
  });

  describe("(b) revocar: estado, sesiones y auditoría en una transacción", () => {
    test("pone estado revocado y cierra todas las sesiones del usuario, ninguna de otro", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const objetivo = await existente("objetivo@ejemplo.test", "operador");
      await sesionDe(objetivo);
      await sesionDe(objetivo);
      await sesionDe(objetivo);
      const delAdmin = await sesionDe(admin);

      const revocado = await casosDeUso().revocar(persona(admin), objetivo);

      expect(revocado.valor.estado).toBe("revocado");
      expect(revocado.actualizadoPor).toEqual(persona(admin));
      expect(revocado.actualizadoEn).toEqual(AHORA);
      expect(await usuario(objetivo)).toEqual(revocado);
      const sesiones = await cliente().sesion.findMany();
      expect(sesiones.map((sesion) => sesion.id)).toEqual([delAdmin.id]);
    });

    test("si la auditoría falla después de cerrar las sesiones, no queda nada hecho", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const objetivo = await existente("objetivo@ejemplo.test", "operador");
      const una = await sesionDe(objetivo);
      await sesionDe(objetivo);
      const antes = await fotoDeLaBase();

      // Lo que ve la transacción justo antes de fallar: prueba que la falla
      // llega después de revocar y de cerrar las sesiones, no antes.
      const vistoAlFallar: { sesion?: unknown; estado?: unknown } = {};
      const real = crearTransaccionalPrisma(cliente());
      const conAuditoriaQueFalla: Transaccional = {
        ejecutar: (trabajo) =>
          real.ejecutar((repos) =>
            trabajo({
              ...repos,
              auditoria: {
                async registrar() {
                  vistoAlFallar.sesion = await repos.sesiones.buscarPorId(
                    una.id,
                  );
                  vistoAlFallar.estado = (
                    await repos.usuarios.buscarPorId(objetivo)
                  )?.valor.estado;
                  throw new Error("falla forzada de la auditoría (test)");
                },
              },
            }),
          ),
      };

      await expect(
        casosDeUso(conAuditoriaQueFalla).revocar(persona(admin), objetivo),
      ).rejects.toThrow("falla forzada de la auditoría (test)");

      expect(vistoAlFallar).toEqual({ sesion: null, estado: "revocado" });
      expect(await fotoDeLaBase()).toEqual(antes);
      expect((await usuario(objetivo))?.valor.estado).toBe("activo");
      expect(
        await cliente().sesion.count({ where: { usuarioId: objetivo } }),
      ).toBe(2);
    });

    test("revocar a alguien que no existe es AUT-0006", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const antes = await fotoDeLaBase();

      await expect(
        casosDeUso().revocar(
          persona(admin),
          identificadorDesde<"Usuario">(generadorId.generar()),
        ),
      ).rejects.toMatchObject({ codigo: "AUT-0006" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("revocar a alguien ya revocado no cambia nada ni audita de nuevo", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const objetivo = await existente("objetivo@ejemplo.test", "operador");
      const casos = casosDeUso();
      await casos.revocar(persona(admin), objetivo);
      const antes = await fotoDeLaBase();

      const otraVez = await casos.revocar(persona(admin), objetivo);

      expect(otraVez.valor.estado).toBe("revocado");
      expect(await fotoDeLaBase()).toEqual(antes);
    });
  });

  describe("(c) el último administrador activo (AUT-0004)", () => {
    test("no puede revocarse a sí mismo, y nada cambia", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      await existente("ex.admin@ejemplo.test", "administrador", "revocado");
      await sesionDe(admin);
      const antes = await fotoDeLaBase();

      await expect(
        casosDeUso().revocar(persona(admin), admin),
      ).rejects.toMatchObject({ codigo: "AUT-0004" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("no puede pasarse a operador, y nada cambia", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const antes = await fotoDeLaBase();

      await expect(
        casosDeUso().cambiarRol(persona(admin), admin, "operador"),
      ).rejects.toMatchObject({ codigo: "AUT-0004" });

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("con otro administrador activo, sí puede revocarse a sí mismo", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      await existente("otro.admin@ejemplo.test", "administrador");

      const revocado = await casosDeUso().revocar(persona(admin), admin);

      expect(revocado.valor.estado).toBe("revocado");
    });

    test("después de revocar a los demás, el que queda es el último", async () => {
      const uno = await existente("uno@ejemplo.test", "administrador");
      const dos = await existente("dos@ejemplo.test", "administrador");
      const tres = await existente("tres@ejemplo.test", "administrador");
      const casos = casosDeUso();

      await casos.revocar(persona(uno), dos);
      await casos.cambiarRol(persona(uno), tres, "operador");

      await expect(casos.revocar(persona(uno), uno)).rejects.toMatchObject({
        codigo: "AUT-0004",
      });
      await expect(
        casos.cambiarRol(persona(uno), uno, "operador"),
      ).rejects.toMatchObject({ codigo: "AUT-0004" });
    });

    test("dos administradores que se revocan uno al otro al mismo tiempo: queda uno", async () => {
      const uno = await existente("uno@ejemplo.test", "administrador");
      const dos = await existente("dos@ejemplo.test", "administrador");
      // Dos clientes: dos conexiones, dos transacciones de verdad en paralelo.
      const otroCliente = crearClientePrisma(uriBaseCompartida());
      try {
        const resultados = await Promise.allSettled([
          casosDeUso().revocar(persona(uno), dos),
          casosDeUso(crearTransaccionalPrisma(otroCliente)).revocar(
            persona(dos),
            uno,
          ),
        ]);

        expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(
          1,
        );
        const rechazo = resultados.find((r) => r.status === "rejected");
        expect(["AUT-0003", "AUT-0004"]).toContain(
          (rechazo?.reason as { codigo?: unknown } | undefined)?.codigo,
        );
        const activos = await cliente().usuario.count({
          where: { rol: "administrador", estado: "activo" },
        });
        expect(activos).toBe(1);
      } finally {
        await otroCliente.$disconnect();
      }
    });
  });

  describe("cambiarRol", () => {
    test("cambia el rol y lo deja auditado con el actor y el reloj", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const objetivo = await existente("objetivo@ejemplo.test", "operador");

      const cambiado = await casosDeUso().cambiarRol(
        persona(admin),
        objetivo,
        "administrador",
      );

      expect(cambiado.valor.rol).toBe("administrador");
      expect(cambiado.actualizadoPor).toEqual(persona(admin));
      expect(cambiado.actualizadoEn).toEqual(AHORA);
      expect(await usuario(objetivo)).toEqual(cambiado);
    });

    test("al mismo rol no cambia nada ni audita", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const objetivo = await existente("objetivo@ejemplo.test", "operador");
      const antes = await fotoDeLaBase();

      await casosDeUso().cambiarRol(persona(admin), objetivo, "operador");

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("cambiar el rol de alguien que no existe es AUT-0006", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");

      await expect(
        casosDeUso().cambiarRol(
          persona(admin),
          identificadorDesde<"Usuario">(generadorId.generar()),
          "administrador",
        ),
      ).rejects.toMatchObject({ codigo: "AUT-0006" });
    });
  });

  describe("(d) cada alta, revocación y cambio de rol queda auditado", () => {
    test("un RegistroAuditoria por operación, con antes y despues", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const casos = casosDeUso();

      const alta = await casos.darDeAlta(
        persona(admin),
        "auditado@ejemplo.test",
        "operador",
      );
      await casos.cambiarRol(persona(admin), alta.valor.id, "administrador");
      await casos.revocar(persona(admin), alta.valor.id);

      const filas = await cliente().auditoria.findMany({
        where: { entidadId: alta.valor.id },
      });
      const actor = { tipo: "persona", usuarioId: admin };
      const en = new Date("2031-05-14T14:20:00.250Z");
      const datos = {
        id: alta.valor.id,
        email: "auditado@ejemplo.test",
        nombre: null,
      };
      expect(filas).toHaveLength(3);
      const crear = filas.find((fila) => fila.accion === "crear");
      const actualizaciones = filas.filter(
        (fila) => fila.accion === "actualizar",
      );
      expect(actualizaciones).toHaveLength(2);
      expect(crear).toMatchObject({
        entidad: "Usuario",
        accion: "crear",
        antes: null,
        despues: { ...datos, rol: "operador", estado: "activo" },
        actor,
        en,
      });
      expect(actualizaciones).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entidad: "Usuario",
            accion: "actualizar",
            antes: { ...datos, rol: "operador", estado: "activo" },
            despues: { ...datos, rol: "administrador", estado: "activo" },
            actor,
            en,
          }),
          expect.objectContaining({
            entidad: "Usuario",
            accion: "actualizar",
            antes: { ...datos, rol: "administrador", estado: "activo" },
            despues: { ...datos, rol: "administrador", estado: "revocado" },
            actor,
            en,
          }),
        ]),
      );
    });
  });
});
