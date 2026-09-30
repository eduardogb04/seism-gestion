/**
 * M-05 · El aviso al administrador (`crearAvisarAdministradores`, armado en
 * `src/infraestructura/arranque/avisos.ts`) contra la base real de usuarios y
 * el doble en memoria de `Notificaciones`:
 *
 * - un envío por administrador **activo** (ni operadores ni revocados);
 * - sin administradores activos no se envía nada y se loguea `warn` con el
 *   código del aviso;
 * - si `enviar` falla, el aviso no lanza: lo cuenta en el log con su código
 *   y sigue con el resto;
 * - el armado de Fase 0 (`armarAvisos`) sale por el log sin el email.
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
import { crearNotificacionesEnMemoria } from "../../src/adaptadores/memoria/notificaciones.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearRepositorioUsuariosPrisma } from "../../src/adaptadores/prisma/usuarios.ts";
import {
  armarAvisos,
  crearAvisarAdministradores,
} from "../../src/infraestructura/arranque/avisos.ts";
import type { Notificaciones } from "../../src/puertos/notificaciones.ts";
import {
  ADMIN_DOS,
  ADMIN_UNO,
  EX_ADMIN,
  OPERADOR,
  sembrarUsuarios,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { capturarLog } from "./_arnes/ia.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function db(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

const MENSAJE = { titulo: "algo pasó", cuerpo: "detalle inventado del aviso" };

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

beforeEach(async () => {
  await limpiarBase();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe("avisar a los administradores", () => {
  test("un envío por administrador activo, con el código en el mensaje; operadores y revocados no reciben", async () => {
    const [uno, dos] = await sembrarUsuarios(db(), [
      ADMIN_UNO,
      ADMIN_DOS,
      OPERADOR,
      EX_ADMIN,
    ]);
    const notificaciones = crearNotificacionesEnMemoria();
    const avisar = crearAvisarAdministradores({
      notificaciones,
      usuarios: crearRepositorioUsuariosPrisma(db()),
      log: capturarLog().log,
    });

    await avisar("INF-0002", MENSAJE);

    const enviados = notificaciones.enviados();
    expect(enviados.map((envio) => envio.destinatario)).toEqual([
      { tipo: "persona", usuarioId: uno?.id },
      { tipo: "persona", usuarioId: dos?.id },
    ]);
    for (const envio of enviados) {
      expect(JSON.stringify(envio.mensaje)).toContain("INF-0002");
      expect(envio.mensaje.cuerpo).toBe(MENSAJE.cuerpo);
    }
  });

  test("un administrador revocado no recibe el aviso", async () => {
    const [vigente] = await sembrarUsuarios(db(), [ADMIN_UNO, EX_ADMIN]);
    const notificaciones = crearNotificacionesEnMemoria();
    const avisar = crearAvisarAdministradores({
      notificaciones,
      usuarios: crearRepositorioUsuariosPrisma(db()),
      log: capturarLog().log,
    });

    await avisar("IA-0001", MENSAJE);

    expect(notificaciones.enviados()).toHaveLength(1);
    expect(notificaciones.enviados()[0]?.destinatario).toEqual({
      tipo: "persona",
      usuarioId: vigente?.id,
    });
  });

  test("sin administradores activos: cero envíos y un warn con el código del aviso", async () => {
    await sembrarUsuarios(db(), [OPERADOR, EX_ADMIN]);
    const notificaciones = crearNotificacionesEnMemoria();
    const { log, lineas } = capturarLog();
    const avisar = crearAvisarAdministradores({
      notificaciones,
      usuarios: crearRepositorioUsuariosPrisma(db()),
      log,
    });

    await avisar("IA-0001", MENSAJE);

    expect(notificaciones.enviados()).toEqual([]);
    expect(lineas()).toHaveLength(1);
    expect(lineas()[0]).toMatchObject({ level: "warn", codigo: "IA-0001" });
  });

  test("si enviar lanza para uno, el aviso no lanza: lo loguea con su código y sigue con el resto", async () => {
    const [primero, segundo] = await sembrarUsuarios(db(), [
      ADMIN_UNO,
      ADMIN_DOS,
    ]);
    const llegados: unknown[] = [];
    const notificaciones: Notificaciones = {
      enviar(destinatario) {
        if (
          destinatario.tipo === "persona" &&
          destinatario.usuarioId === primero?.id
        ) {
          return Promise.reject(new Error("canal caído"));
        }
        llegados.push(destinatario);
        return Promise.resolve({ ok: true, valor: undefined });
      },
    };
    const { log, lineas } = capturarLog();
    const avisar = crearAvisarAdministradores({
      notificaciones,
      usuarios: crearRepositorioUsuariosPrisma(db()),
      log,
    });

    await expect(avisar("INF-0002", MENSAJE)).resolves.toBeUndefined();

    expect(llegados).toEqual([{ tipo: "persona", usuarioId: segundo?.id }]);
    expect(lineas()).toHaveLength(1);
    expect(lineas()[0]).toMatchObject({
      level: "error",
      codigo: "INF-0001",
      aviso: "INF-0002",
    });
  });

  test("si enviar devuelve un mensaje inválido, no lanza y lo loguea con su código", async () => {
    await sembrarUsuarios(db(), [ADMIN_UNO]);
    const notificaciones: Notificaciones = {
      enviar: () =>
        Promise.resolve({
          ok: false,
          error: { codigo: "NOTIFICACIONES.MENSAJE_INVALIDO", campo: "cuerpo" },
        }),
    };
    const { log, lineas } = capturarLog();
    const avisar = crearAvisarAdministradores({
      notificaciones,
      usuarios: crearRepositorioUsuariosPrisma(db()),
      log,
    });

    await expect(avisar("INF-0002", MENSAJE)).resolves.toBeUndefined();

    expect(lineas()).toHaveLength(1);
    expect(lineas()[0]).toMatchObject({
      codigo: "NOTIFICACIONES.MENSAJE_INVALIDO",
      aviso: "INF-0002",
    });
  });

  test("si no se puede leer a los usuarios, el aviso no lanza y lo loguea con su código", async () => {
    const { log, lineas } = capturarLog();
    const usuarios = crearRepositorioUsuariosPrisma(db());
    const avisar = crearAvisarAdministradores({
      notificaciones: crearNotificacionesEnMemoria(),
      usuarios: {
        ...usuarios,
        listar: () => Promise.reject(new Error("base caída")),
      },
      log,
    });

    await expect(avisar("IA-0001", MENSAJE)).resolves.toBeUndefined();

    expect(lineas()).toHaveLength(1);
    expect(lineas()[0]).toMatchObject({ codigo: "INF-0001", aviso: "IA-0001" });
  });

  test("el armado de Fase 0 avisa por el log con el usuarioId y sin el email", async () => {
    const [admin] = await sembrarUsuarios(db(), [ADMIN_UNO]);
    const { log, lineas } = capturarLog();
    const { avisar } = armarAvisos({
      usuarios: crearRepositorioUsuariosPrisma(db()),
      log,
    });

    await avisar("INF-0002", MENSAJE);

    expect(lineas()).toHaveLength(1);
    expect(lineas()[0]).toMatchObject({
      level: "warn",
      destinatario: admin?.id,
    });
    expect(JSON.stringify(lineas())).not.toContain("ejemplo.test");
  });
});
