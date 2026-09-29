/**
 * Las Server Actions de `/administracion/usuarios` (F0-32) contra el Postgres
 * de verdad del arnés. Se llaman como las llama Next —con un `FormData`— y se
 * lee a dónde redirigen. Solo se reemplaza lo que es de Next o del armado:
 * la cookie (`next/headers`) y el punto de armado, que acá apunta a la base
 * del test con los casos de uso de verdad.
 *
 * - R4: el actor sale solo de la sesión; un campo del formulario que diga
 *   quién actúa no cambia nada.
 * - R5: rol inventado o id mal formado → `AUT-0008`; email mal formado →
 *   `AUT-0007`, en minúsculas y sin espacios si es válido; nada se crea.
 * - R6: un operador que arma el POST a mano recibe `AUT-0003` y **nada cambia
 *   en la base**, en las tres acciones.
 * - Sin sesión: `AUT-0002`, nada cambia.
 * - R3: revocar desde la acción corta la sesión de esa persona en la
 *   siguiente validación, sin avanzar el reloj.
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
  vi,
} from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearRepositorioUsuariosPrisma } from "../../src/adaptadores/prisma/usuarios.ts";
import { crearCasosUsoSesion } from "../../src/casos-uso/sesion/sesion.ts";
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
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type {
  EstadoUsuario,
  Rol,
} from "../../src/puertos/repositorios/usuarios.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

const { cookie, punto } = vi.hoisted(() => ({
  cookie: { valor: undefined as string | undefined },
  punto: { armado: undefined as unknown },
}));

vi.mock("next/headers.js", () => ({
  cookies: async () => ({
    get: (nombre: string) =>
      nombre === "seism_sesion" && cookie.valor !== undefined
        ? { name: nombre, value: cookie.valor }
        : undefined,
  }),
}));

vi.mock("../../src/infraestructura/arranque/armado.ts", () => ({
  armado: () => punto.armado,
}));

const { altaDeUsuario, cambiarRolDeUsuario, revocarUsuario } = await import(
  "../../src/app/administracion/usuarios/acciones.ts"
);

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

/** A dónde redirige una acción (siempre redirige). */
async function destino(accion: Promise<void>): Promise<string> {
  try {
    await accion;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
      return digest.split(";")[2] ?? "";
    }
    throw error;
  }
  throw new Error("la acción tendría que haber redirigido");
}

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) {
    datos.set(nombre, valor);
  }
  return datos;
}

async function existente(
  email: string,
  rol: Rol,
  estado: EstadoUsuario = "activo",
): Promise<Identificador<"Usuario">> {
  const nombre = crearNombreProceso("preparacion-test");
  if (!nombre.ok) {
    throw new Error(nombre.error);
  }
  const id = identificadorDesde<"Usuario">(generadorId.generar());
  await crearRepositorioUsuariosPrisma(cliente()).crear(
    crearAuditable(
      { id, email, nombre: null, rol, estado },
      { tipo: "sistema", proceso: nombre.valor },
      RelojFijo(fecha(8)),
    ),
  );
  return id;
}

/** Deja el punto de armado apuntando a la base del test, como lo arma la app. */
function armarPunto() {
  const transaccional = crearTransaccionalPrisma(cliente());
  const sesion = crearCasosUsoSesion({ transaccional, reloj: RELOJ });
  const usuarios = crearCasosUsoUsuarios({
    transaccional,
    reloj: RELOJ,
    generadorId,
    sesiones: sesion,
  });
  punto.armado = { sesion, usuarios };
  return sesion;
}

/** Abre una sesión de verdad para `email` y deja su cookie puesta. */
async function entrarComo(
  sesion: ReturnType<typeof armarPunto>,
  email: string,
): Promise<string> {
  const abierta = await sesion.completarSesion(
    { proveedor: "falsa", sub: `falsa:${email}`, email, emailVerificado: true },
    null,
  );
  cookie.valor = abierta.id;
  return abierta.id;
}

async function fotoDeLaBase() {
  const db = cliente();
  return {
    usuarios: await db.usuario.findMany({ orderBy: { email: "asc" } }),
    sesiones: await db.sesion.findMany({ orderBy: { id: "asc" } }),
    auditoria: await db.auditoria.findMany({ orderBy: { id: "asc" } }),
  };
}

const LISTA = "/administracion/usuarios";
const conError = (codigo: string) => `${LISTA}?error=${codigo}`;

describe("acciones de /administracion/usuarios", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    cookie.valor = undefined;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("un administrador", () => {
    test("da de alta: el email queda sin espacios y en minúsculas, activo, con el actor de la sesión", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const sesion = armarPunto();
      await entrarComo(sesion, "admin@ejemplo.test");

      const va = await destino(
        altaDeUsuario(
          formulario({ email: "  Operadora@Ejemplo.TEST ", rol: "operador" }),
        ),
      );

      expect(va).toBe(LISTA);
      const creada = await cliente().usuario.findUnique({
        where: { email: "operadora@ejemplo.test" },
      });
      expect(creada).toMatchObject({ rol: "operador", estado: "activo" });
      expect(creada?.creadoPor).toEqual({ tipo: "persona", usuarioId: admin });
    });

    test("un campo del formulario que diga quién actúa no cambia el actor", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const otro = await existente("otro@ejemplo.test", "administrador");
      const sesion = armarPunto();
      await entrarComo(sesion, "admin@ejemplo.test");

      await destino(
        altaDeUsuario(
          formulario({
            email: "nueva@ejemplo.test",
            rol: "operador",
            actor: otro,
            actorId: otro,
            usuarioId: otro,
            creadoPor: otro,
          }),
        ),
      );

      const creada = await cliente().usuario.findUnique({
        where: { email: "nueva@ejemplo.test" },
      });
      expect(creada?.creadoPor).toEqual({ tipo: "persona", usuarioId: admin });
    });

    test("un rol inventado es AUT-0008 y no crea nada", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const sesion = armarPunto();
      await entrarComo(sesion, "admin@ejemplo.test");
      const antes = await fotoDeLaBase();

      const va = await destino(
        altaDeUsuario(
          formulario({
            email: "nueva@ejemplo.test",
            rol: "superadministrador",
          }),
        ),
      );

      expect(va).toBe(conError("AUT-0008"));
      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("un email que no es un email es AUT-0007 y no crea nada", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const sesion = armarPunto();
      await entrarComo(sesion, "admin@ejemplo.test");
      const antes = await fotoDeLaBase();

      const va = await destino(
        altaDeUsuario(formulario({ email: "no-es-un-email", rol: "operador" })),
      );

      expect(va).toBe(conError("AUT-0007"));
      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("un email repetido con otras mayúsculas es AUT-0005", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const sesion = armarPunto();
      await entrarComo(sesion, "admin@ejemplo.test");
      const antes = await fotoDeLaBase();

      const va = await destino(
        altaDeUsuario(
          formulario({ email: "ADMIN@ejemplo.test", rol: "operador" }),
        ),
      );

      expect(va).toBe(conError("AUT-0005"));
      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("cambia el rol; uno inventado es AUT-0008 y un id que no es UUID también", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const operadora = await existente("operadora@ejemplo.test", "operador");
      const sesion = armarPunto();
      await entrarComo(sesion, "admin@ejemplo.test");

      expect(
        await destino(
          cambiarRolDeUsuario(
            formulario({ usuarioId: operadora, rol: "dueña" }),
          ),
        ),
      ).toBe(conError("AUT-0008"));
      expect(
        await destino(
          cambiarRolDeUsuario(
            formulario({ usuarioId: "no-es-un-id", rol: "administrador" }),
          ),
        ),
      ).toBe(conError("AUT-0008"));
      expect(
        await cliente().usuario.findUnique({ where: { id: operadora } }),
      ).toMatchObject({ rol: "operador" });

      expect(
        await destino(
          cambiarRolDeUsuario(
            formulario({ usuarioId: operadora, rol: "administrador" }),
          ),
        ),
      ).toBe(LISTA);
      expect(
        await cliente().usuario.findUnique({ where: { id: operadora } }),
      ).toMatchObject({ rol: "administrador" });
    });

    test("revocar al único administrador (a sí mismo) es AUT-0004", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const sesion = armarPunto();
      await entrarComo(sesion, "admin@ejemplo.test");

      expect(
        await destino(revocarUsuario(formulario({ usuarioId: admin }))),
      ).toBe(conError("AUT-0004"));
    });

    test("revocar corta la sesión de esa persona en la siguiente validación, sin avanzar el reloj (R3)", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const operadora = await existente("operadora@ejemplo.test", "operador");
      const sesion = armarPunto();
      const tokenOperadora = await entrarComo(sesion, "operadora@ejemplo.test");
      await sesion.validarSesion(tokenOperadora);
      await entrarComo(sesion, "admin@ejemplo.test");

      const va = await destino(
        revocarUsuario(formulario({ usuarioId: operadora })),
      );

      expect(va).toBe(LISTA);
      await expect(sesion.validarSesion(tokenOperadora)).rejects.toMatchObject({
        codigo: "AUT-0002",
      });
    });
  });

  describe("un operador que arma el POST a mano (R6)", () => {
    test("recibe AUT-0003 en las tres acciones y la base queda igual", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const operador = await existente("operador@ejemplo.test", "operador");
      const otra = await existente("otra@ejemplo.test", "operador");
      const sesion = armarPunto();
      await entrarComo(sesion, "operador@ejemplo.test");
      const antes = await fotoDeLaBase();

      expect(
        await destino(
          altaDeUsuario(
            formulario({ email: "nueva@ejemplo.test", rol: "administrador" }),
          ),
        ),
      ).toBe(conError("AUT-0003"));
      expect(
        await destino(revocarUsuario(formulario({ usuarioId: otra }))),
      ).toBe(conError("AUT-0003"));
      expect(
        await destino(
          cambiarRolDeUsuario(
            formulario({ usuarioId: operador, rol: "administrador" }),
          ),
        ),
      ).toBe(conError("AUT-0003"));

      expect(await fotoDeLaBase()).toEqual(antes);
    });

    test("un campo que diga que actúa un administrador no le da permiso", async () => {
      const admin = await existente("admin@ejemplo.test", "administrador");
      const otra = await existente("otra@ejemplo.test", "operador");
      await existente("operador@ejemplo.test", "operador");
      const sesion = armarPunto();
      await entrarComo(sesion, "operador@ejemplo.test");
      const antes = await fotoDeLaBase();

      expect(
        await destino(
          revocarUsuario(
            formulario({
              usuarioId: otra,
              actor: admin,
              actorId: admin,
              rol: "administrador",
            }),
          ),
        ),
      ).toBe(conError("AUT-0003"));

      expect(await fotoDeLaBase()).toEqual(antes);
    });
  });

  describe("sin sesión", () => {
    test("las tres acciones mandan a AUT-0002 y la base queda igual", async () => {
      await existente("admin@ejemplo.test", "administrador");
      const otra = await existente("otra@ejemplo.test", "operador");
      armarPunto();
      const antes = await fotoDeLaBase();
      const ENTRADA = "/ingresar/error?codigo=AUT-0002";

      cookie.valor = undefined;
      expect(
        await destino(
          altaDeUsuario(
            formulario({ email: "nueva@ejemplo.test", rol: "operador" }),
          ),
        ),
      ).toBe(ENTRADA);
      cookie.valor = "token-que-no-existe";
      expect(
        await destino(revocarUsuario(formulario({ usuarioId: otra }))),
      ).toBe(ENTRADA);
      expect(
        await destino(
          cambiarRolDeUsuario(
            formulario({ usuarioId: otra, rol: "administrador" }),
          ),
        ),
      ).toBe(ENTRADA);

      expect(await fotoDeLaBase()).toEqual(antes);
    });
  });
});
