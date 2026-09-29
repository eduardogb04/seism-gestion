/**
 * La semilla del primer administrador (F0-30): `sembrar` da de alta el email
 * de `ADMIN_INICIAL_EMAIL` como administrador activo si no existe, deja la
 * auditoría del alta a nombre del proceso `db-seed`, es idempotente y no toca
 * a ningún otro usuario. Contra el Postgres de verdad del arnés.
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
import { sembrar } from "../../prisma/seed.ts";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearRepositorioUsuariosPrisma } from "../../src/adaptadores/prisma/usuarios.ts";
import { crearNombreProceso } from "../../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
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

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function fecha(dia: number): FechaHora {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia,
    hora: 8,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const EMAIL = "Admin.Inicial@Ejemplo.TEST";
const opciones = (dia = 10) => ({
  adminInicialEmail: EMAIL,
  reloj: RelojFijo(fecha(dia)),
});

async function existente(email: string, rol: Rol, estado: EstadoUsuario) {
  const nombre = crearNombreProceso("preparacion-test");
  if (!nombre.ok) {
    throw new Error(nombre.error);
  }
  await crearRepositorioUsuariosPrisma(cliente()).crear(
    crearAuditable(
      {
        id: identificadorDesde<"Usuario">(crearGeneradorIdCrypto().generar()),
        email,
        nombre: null,
        rol,
        estado,
      },
      { tipo: "sistema", proceso: nombre.valor },
      RelojFijo(fecha(1)),
    ),
  );
}

async function fotoDeLaBase() {
  const db = cliente();
  return {
    usuarios: await db.usuario.findMany({ orderBy: { email: "asc" } }),
    auditoria: await db.auditoria.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("semilla del administrador inicial", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("da de alta ADMIN_INICIAL_EMAIL como administrador activo, en minúsculas y auditado", async () => {
    await sembrar(cliente(), opciones());

    const admin = await crearRepositorioUsuariosPrisma(
      cliente(),
    ).buscarPorEmail(EMAIL);
    expect(admin?.valor).toMatchObject({
      email: "admin.inicial@ejemplo.test",
      rol: "administrador",
      estado: "activo",
    });
    expect(admin?.creadoPor).toEqual({ tipo: "sistema", proceso: "db-seed" });
    expect(admin?.creadoEn).toEqual(fecha(10));
    const auditoria = await cliente().auditoria.findMany();
    expect(auditoria).toEqual([
      expect.objectContaining({
        entidad: "Usuario",
        entidadId: admin?.valor.id,
        accion: "crear",
        antes: null,
        actor: { tipo: "sistema", proceso: "db-seed" },
      }),
    ]);
  });

  test("es idempotente: la segunda vez no duplica, no falla y no escribe nada", async () => {
    await sembrar(cliente(), opciones(10));
    const primeraVez = await fotoDeLaBase();

    await sembrar(cliente(), opciones(11));

    expect(await fotoDeLaBase()).toEqual(primeraVez);
    expect(primeraVez.usuarios).toHaveLength(1);
  });

  test("no toca a los demás usuarios, ni al del email si ya existía (aunque esté revocado)", async () => {
    await existente("operador@ejemplo.test", "operador", "activo");
    await existente("admin.inicial@ejemplo.test", "operador", "revocado");
    const antes = await fotoDeLaBase();

    await sembrar(cliente(), opciones());

    expect(await fotoDeLaBase()).toEqual(antes);
  });

  test("con otros usuarios ya cargados, igual da de alta al administrador inicial", async () => {
    await existente("operador@ejemplo.test", "operador", "activo");
    const antes = await fotoDeLaBase();

    await sembrar(cliente(), opciones());

    const despues = await fotoDeLaBase();
    expect(despues.usuarios).toHaveLength(2);
    expect(despues.usuarios).toEqual(expect.arrayContaining(antes.usuarios));
  });
});
