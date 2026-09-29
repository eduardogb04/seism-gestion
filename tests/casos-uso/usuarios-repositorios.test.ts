/**
 * Los adaptadores Prisma de usuarios, sesiones y auditoría (F0-30) contra el
 * Postgres de verdad del arnés de casos de uso: lo que guardan se lee igual,
 * el email no distingue mayúsculas, el id de sesión es un token de 256 bits
 * de `node:crypto`, `cerrarTodasDe` cierra solo las del usuario y la
 * auditoría solo agrega filas.
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
import { crearAuditoriaPrisma } from "../../src/adaptadores/prisma/auditoria.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearRepositorioSesionesPrisma } from "../../src/adaptadores/prisma/sesiones.ts";
import { crearRepositorioUsuariosPrisma } from "../../src/adaptadores/prisma/usuarios.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { crearNombreProceso } from "../../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../../src/dominio/compartido/auditable.ts";
import { ErrorSistema } from "../../src/dominio/compartido/errores/error-sistema.ts";
import {
  type Identificador,
  identificadorDesde,
} from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  type FechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type { Rol, Usuario } from "../../src/puertos/repositorios/usuarios.ts";
import { limpiarBase, psqlEn, uriBaseCompartida } from "./_arnes/base.ts";
import { BASE_COMPARTIDA } from "./_arnes/contenedor.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function fecha(dia: number, hora = 9, milisegundo = 0): FechaHora {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 3,
    dia,
    hora,
    minuto: 15,
    segundo: 30,
    milisegundo,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const generadorId = crearGeneradorIdCrypto();

function procesoDePrueba(): Actor {
  const nombre = crearNombreProceso("prueba-repositorios");
  if (!nombre.ok) {
    throw new Error(nombre.error);
  }
  return { tipo: "sistema", proceso: nombre.valor };
}

function usuarioNuevo(email: string, rol: Rol = "operador"): Usuario {
  return crearAuditable(
    {
      id: identificadorDesde<"Usuario">(generadorId.generar()),
      email,
      nombre: null,
      rol,
      estado: "activo",
    },
    procesoDePrueba(),
    RelojFijo(fecha(3, 23, 999)),
  );
}

describe("adaptadores Prisma de usuarios, sesiones y auditoría", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("usuarios", () => {
    test("lo que se guarda se lee igual: datos, fechas del reloj y actores", async () => {
      const repo = crearRepositorioUsuariosPrisma(cliente());
      const usuario = usuarioNuevo("persona.inventada@ejemplo.test");

      await repo.crear(usuario);

      expect(await repo.buscarPorId(usuario.valor.id)).toEqual(usuario);
      expect(
        await repo.buscarPorEmail("persona.inventada@ejemplo.test"),
      ).toEqual(usuario);
    });

    test("un actor persona también vuelve igual", async () => {
      const repo = crearRepositorioUsuariosPrisma(cliente());
      const creador = usuarioNuevo("creador@ejemplo.test", "administrador");
      await repo.crear(creador);
      const actor: Actor = { tipo: "persona", usuarioId: creador.valor.id };
      const usuario = crearAuditable(
        { ...usuarioNuevo("otra@ejemplo.test").valor },
        actor,
        RelojFijo(fecha(4)),
      );

      await repo.crear(usuario);

      expect(await repo.buscarPorId(usuario.valor.id)).toEqual(usuario);
    });

    test("guarda y busca el email en minúsculas", async () => {
      const repo = crearRepositorioUsuariosPrisma(cliente());
      const usuario = usuarioNuevo("Mayusculas.Inventadas@Ejemplo.TEST");

      await repo.crear(usuario);

      const leido = await repo.buscarPorEmail(
        "MAYUSCULAS.inventadas@ejemplo.test",
      );
      expect(leido?.valor.email).toBe("mayusculas.inventadas@ejemplo.test");
    });

    test("el email es único sin distinguir mayúsculas: A@ y a@ son el mismo (AUT-0005)", async () => {
      const repo = crearRepositorioUsuariosPrisma(cliente());
      await repo.crear(usuarioNuevo("A@ejemplo.test"));

      const segundo = repo.crear(usuarioNuevo("a@ejemplo.test"));

      await expect(segundo).rejects.toBeInstanceOf(ErrorSistema);
      await expect(segundo).rejects.toMatchObject({ codigo: "AUT-0005" });
      expect(await cliente().usuario.count()).toBe(1);
    });

    test("la base rechaza un email con mayúsculas escrito sin pasar por el adaptador", async () => {
      const resultado = await psqlEn(BASE_COMPARTIDA)(
        `insert into usuarios (email, rol, creado_en, creado_por, actualizado_en, actualizado_por)
         values ('Directo@ejemplo.test', 'operador', now(), '{}', now(), '{}');`,
      );

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.error).toContain("usuarios_email_en_minusculas");
    });

    test("actualizar reemplaza datos y auditoría", async () => {
      const repo = crearRepositorioUsuariosPrisma(cliente());
      const usuario = usuarioNuevo("cambia@ejemplo.test");
      await repo.crear(usuario);
      const cambiado: Usuario = {
        ...usuario,
        valor: { ...usuario.valor, rol: "administrador", estado: "revocado" },
        actualizadoEn: fecha(20, 18, 7),
      };

      await repo.actualizar(cambiado);

      expect(await repo.buscarPorId(usuario.valor.id)).toEqual(cambiado);
    });

    test("bloquearAdministradoresActivos devuelve solo los administradores activos", async () => {
      const repo = crearRepositorioUsuariosPrisma(cliente());
      const activo = usuarioNuevo("admin.activo@ejemplo.test", "administrador");
      const revocado = usuarioNuevo(
        "admin.revocado@ejemplo.test",
        "administrador",
      );
      await repo.crear(activo);
      await repo.crear({
        ...revocado,
        valor: { ...revocado.valor, estado: "revocado" },
      });
      await repo.crear(usuarioNuevo("operador@ejemplo.test"));

      const ids = await cliente().$transaction((tx) =>
        crearRepositorioUsuariosPrisma(tx).bloquearAdministradoresActivos(),
      );

      expect(ids).toEqual([activo.valor.id]);
    });

    test("buscar lo que no existe da null", async () => {
      const repo = crearRepositorioUsuariosPrisma(cliente());

      expect(
        await repo.buscarPorId(
          identificadorDesde<"Usuario">(generadorId.generar()),
        ),
      ).toBeNull();
      expect(await repo.buscarPorEmail("nadie@ejemplo.test")).toBeNull();
    });
  });

  describe("sesiones", () => {
    async function usuarioGuardado(
      email: string,
    ): Promise<Identificador<"Usuario">> {
      const usuario = usuarioNuevo(email);
      await crearRepositorioUsuariosPrisma(cliente()).crear(usuario);
      return usuario.valor.id;
    }

    test("abrir genera un token de 256 bits en base64url (43 caracteres), distinto cada vez", async () => {
      const repo = crearRepositorioSesionesPrisma(cliente());
      const usuarioId = await usuarioGuardado("sesiones@ejemplo.test");

      const ids = new Set<string>();
      for (let i = 0; i < 50; i += 1) {
        const sesion = await repo.abrir({
          usuarioId,
          creadaEn: fecha(5),
          expiraEn: fecha(6),
          agente: null,
        });
        expect(sesion.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
        // 43 caracteres base64url sin relleno son exactamente 32 bytes.
        expect(Buffer.from(sesion.id, "base64url")).toHaveLength(32);
        ids.add(sesion.id);
      }
      expect(ids.size).toBe(50);
    });

    test("lo que se abre se lee igual, con ultimoUso en creadaEn", async () => {
      const repo = crearRepositorioSesionesPrisma(cliente());
      const usuarioId = await usuarioGuardado("lectura@ejemplo.test");

      const sesion = await repo.abrir({
        usuarioId,
        creadaEn: fecha(5, 10, 123),
        expiraEn: fecha(12, 10, 123),
        agente: "NavegadorInventado/1.0",
      });

      expect(sesion.ultimoUso).toEqual(fecha(5, 10, 123));
      expect(await repo.buscarPorId(sesion.id)).toEqual(sesion);
      expect(await repo.buscarPorId("no-existe")).toBeNull();
    });

    test("cerrarTodasDe cierra todas las del usuario y ninguna de otro", async () => {
      const repo = crearRepositorioSesionesPrisma(cliente());
      const uno = await usuarioGuardado("uno@ejemplo.test");
      const otro = await usuarioGuardado("otro@ejemplo.test");
      const datos = { creadaEn: fecha(5), expiraEn: fecha(6), agente: null };
      await repo.abrir({ ...datos, usuarioId: uno });
      await repo.abrir({ ...datos, usuarioId: uno });
      const delOtro = await repo.abrir({ ...datos, usuarioId: otro });

      expect(await repo.cerrarTodasDe(uno)).toBe(2);

      expect(await cliente().sesion.count({ where: { usuarioId: uno } })).toBe(
        0,
      );
      expect(await repo.buscarPorId(delOtro.id)).toEqual(delOtro);
    });
  });

  describe("auditoría", () => {
    test("registrar guarda una fila con todas las columnas de RegistroAuditoria", async () => {
      const auditoria = crearAuditoriaPrisma(cliente());
      const actor: Actor = {
        tipo: "persona",
        usuarioId: identificadorDesde<"Usuario">(generadorId.generar()),
      };
      const id = identificadorDesde<"Usuario">(generadorId.generar());

      await auditoria.registrar({
        entidad: "Usuario",
        id,
        accion: "actualizar",
        antes: { rol: "operador", estado: "activo" },
        despues: { rol: "administrador", estado: "activo" },
        actor,
        en: fecha(7, 16, 45),
      });

      const filas = await cliente().auditoria.findMany();
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        entidad: "Usuario",
        entidadId: id,
        accion: "actualizar",
        antes: { rol: "operador", estado: "activo" },
        despues: { rol: "administrador", estado: "activo" },
        actor: { tipo: "persona", usuarioId: actor.usuarioId },
        // 16:15:30.045 en la Argentina (UTC-3, ADR 0024) son las 19:15:30.045 UTC.
        en: new Date("2031-03-07T19:15:30.045Z"),
      });
    });

    test("un registro sin antes guarda null (no el JSON null)", async () => {
      const auditoria = crearAuditoriaPrisma(cliente());

      await auditoria.registrar({
        entidad: "Usuario",
        id: identificadorDesde<"Usuario">(generadorId.generar()),
        accion: "crear",
        antes: null,
        despues: { email: "nuevo@ejemplo.test" },
        actor: procesoDePrueba(),
        en: fecha(8),
      });

      const resultado = await psqlEn(BASE_COMPARTIDA)(
        "select count(*) from auditoria where antes is null;",
      );
      expect(resultado.salida.trim()).toBe("1");
    });

    test("el adaptador solo agrega: no expone nada para cambiar ni quitar filas", () => {
      expect(Object.keys(crearAuditoriaPrisma(cliente()))).toEqual([
        "registrar",
      ]);
    });
  });
});
