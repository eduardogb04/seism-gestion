/**
 * Las Server Actions del molde de ABM (F1-03, ADR 0031) contra el Postgres de
 * verdad del arnés, llamadas como las llama Next: con lo que las pantallas
 * les atan (entidad, id), el estado previo y un `FormData`. Solo se reemplaza
 * lo que es de Next o del armado: la cookie y el punto de armado.
 *
 * - Lo que no pasa **vuelve al formulario**: lo que la persona escribió, tal
 *   cual, y el mensaje de cada campo; un error que no es de un campo, con su
 *   código del catálogo.
 * - El actor sale solo de la sesión; sin sesión, `AUT-0002` y nada cambia.
 * - La entidad y el id llegan de afuera: si no existen, el error vuelve con su
 *   código (`DOM-0009`) para mostrarlo en pantalla; ninguna acción lanza.
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
  vi,
} from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import { crearCasosUsoSesion } from "../../src/casos-uso/sesion/sesion.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  OPERADOR,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
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

const { crearRegistro, darDeBajaRegistro, guardarRegistro } = await import(
  "../../src/app/catalogo/_abm/acciones.ts"
);

let prisma: ReturnType<typeof crearClientePrisma> | undefined;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function reloj() {
  const fecha = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 10,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!fecha.ok) {
    throw new Error(fecha.mensaje);
  }
  return RelojFijo(fecha.fechaHora);
}

const LISTA = "/catalogo/grupos";
const SIN_SESION = "/ingresar/error?codigo=AUT-0002";
const VACIO = { escrito: {}, errores: {} };

/** A dónde redirige una acción que tiene que redirigir. */
async function destino(accion: Promise<unknown>): Promise<string> {
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

async function filas() {
  return {
    grupos: await cliente().grupo.findMany({ orderBy: { nombre: "asc" } }),
    auditoria: await cliente().auditoria.count(),
  };
}

describe("acciones del molde de ABM", () => {
  let operador: UsuarioSembrado | undefined;

  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    cookie.valor = undefined;
    [operador] = await sembrarUsuarios(cliente(), [OPERADOR]);
    const transaccional = crearTransaccionalPrisma(cliente());
    const sesion = crearCasosUsoSesion({ transaccional, reloj: reloj() });
    punto.armado = {
      sesion,
      abm: crearCasosUsoAbm({
        transaccional,
        reloj: reloj(),
        generadorId: crearGeneradorIdCrypto(),
      }),
    };
    const abierta = await sesion.completarSesion(
      {
        proveedor: "falsa",
        sub: `falsa:${OPERADOR.email}`,
        email: OPERADOR.email,
        emailVerificado: true,
      },
      null,
    );
    cookie.valor = abierta.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function alta(nombre: string): Promise<string> {
    await destino(
      crearRegistro("Grupo", VACIO, formulario({ nombre, observaciones: "" })),
    );
    const fila = await cliente().grupo.findFirstOrThrow({ where: { nombre } });
    return fila.id;
  }

  test("el alta guarda con el actor de la sesión —no con lo que diga el formulario— y vuelve al listado", async () => {
    const va = await destino(
      crearRegistro(
        "Grupo",
        VACIO,
        formulario({
          nombre: "Grupo Norte",
          observaciones: "Una nota",
          actor: "00000000-0000-4000-8000-00000000ffff",
          usuarioId: "00000000-0000-4000-8000-00000000ffff",
        }),
      ),
    );

    expect(va).toBe(LISTA);
    const { grupos } = await filas();
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({
      nombre: "Grupo Norte",
      observaciones: "Una nota",
      creadoPor: { tipo: "persona", usuarioId: operador?.id },
    });
  });

  test("una validación fallida devuelve lo escrito, tal cual, y el mensaje de cada campo", async () => {
    const antes = await filas();
    const datos = formulario({ nombre: "   ", observaciones: " Una nota " });
    datos.set("$ACTION_KEY", "lo-agrega-react");

    const estado = await crearRegistro("Grupo", VACIO, datos);

    expect(estado).toEqual({
      escrito: { nombre: "   ", observaciones: " Una nota " },
      errores: { nombre: "Escribí el nombre." },
    });
    expect(await filas()).toEqual(antes);
  });

  test("un nombre repetido devuelve lo escrito y DOM-0008 en ese campo, en el alta y en la edición", async () => {
    await alta("Grupo Norte");
    const id = await alta("Grupo Sur");
    const antes = await filas();
    const escrito = { nombre: "grupo norte", observaciones: "Otra nota" };

    const enAlta = await crearRegistro("Grupo", VACIO, formulario(escrito));
    const enEdicion = await guardarRegistro(
      "Grupo",
      id,
      VACIO,
      formulario(escrito),
    );

    for (const estado of [enAlta, enEdicion]) {
      expect(estado).toEqual({
        escrito,
        errores: { nombre: expect.stringContaining("DOM-0008") },
      });
    }
    expect(await filas()).toEqual(antes);
  });

  test("la edición guarda y vuelve al listado", async () => {
    const id = await alta("Grupo Norte");

    const va = await destino(
      guardarRegistro(
        "Grupo",
        id,
        VACIO,
        formulario({ nombre: "Grupo Centro", observaciones: "" }),
      ),
    );

    expect(va).toBe(LISTA);
    expect((await filas()).grupos.map(({ nombre }) => nombre)).toEqual([
      "Grupo Centro",
    ]);
  });

  test("editar un registro que no existe devuelve lo escrito y el error con su código", async () => {
    const escrito = { nombre: "Grupo Norte", observaciones: "" };

    const estado = await guardarRegistro(
      "Grupo",
      "00000000-0000-4000-8000-00000000abcd",
      VACIO,
      formulario(escrito),
    );

    expect(estado).toMatchObject({
      escrito,
      errores: {},
      error: { codigo: "DOM-0009" },
    });
    expect(estado.error?.mensaje).not.toBe("");
  });

  test("la baja marca el registro y vuelve al listado; la de uno que ya no está devuelve el error con su código", async () => {
    const id = await alta("Grupo Norte");

    const va = await destino(
      darDeBajaRegistro("Grupo", id, VACIO, formulario({})),
    );
    const otraVez = await darDeBajaRegistro("Grupo", id, VACIO, formulario({}));

    expect(va).toBe(LISTA);
    expect(otraVez).toMatchObject({
      errores: {},
      error: { codigo: "DOM-0009" },
    });
    const { grupos } = await filas();
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.eliminadoEn).not.toBeNull();
  });

  test("sin sesión, las tres redirigen a AUT-0002 y nada cambia", async () => {
    const id = await alta("Grupo Norte");
    const antes = await filas();
    const datos = formulario({ nombre: "Grupo Sur", observaciones: "" });
    cookie.valor = undefined;

    expect(await destino(crearRegistro("Grupo", VACIO, datos))).toBe(
      SIN_SESION,
    );
    expect(await destino(guardarRegistro("Grupo", id, VACIO, datos))).toBe(
      SIN_SESION,
    );
    expect(
      await destino(darDeBajaRegistro("Grupo", id, VACIO, formulario({}))),
    ).toBe(SIN_SESION);
    expect(await filas()).toEqual(antes);
  });

  test("una entidad o un id que no existen no rompen: las tres devuelven DOM-0009 para mostrar, y nada cambia", async () => {
    const id = await alta("Grupo Norte");
    const antes = await filas();
    const escrito = { nombre: "Grupo Sur", observaciones: "" };
    const datos = formulario(escrito);

    const estados = [
      await crearRegistro("Usuario", VACIO, datos),
      await guardarRegistro("toString", id, VACIO, datos),
      await guardarRegistro("Grupo", "no-es-un-id", VACIO, datos),
      await darDeBajaRegistro("NoExiste", id, VACIO, datos),
      await darDeBajaRegistro("Grupo", "no-es-un-id", VACIO, datos),
    ];

    for (const estado of estados) {
      expect(estado).toMatchObject({
        escrito,
        errores: {},
        error: { codigo: "DOM-0009" },
      });
    }
    expect(await filas()).toEqual(antes);
  });
});
