/**
 * El molde de ABM (F1-03, ADR 0031) contra el Postgres de verdad del arnés,
 * probado una vez con Grupos, su primer uso:
 *
 * - alta, edición y baja lógica, cada una con su fila de `auditoria` (`antes`
 *   y `despues`) en la **misma transacción**;
 * - validación y valor único repetido: vuelven por campo y no escriben nada;
 * - el único es entre los no eliminados, sin mayúsculas ni espacios de los
 *   extremos, y además lo garantiza la base;
 * - quien no tiene un rol de `rolesQueEscriben` (o está revocado, o es un
 *   proceso) no escribe: `AUT-0009`, sin fila ni auditoría;
 * - listado con búsqueda, orden y paginado; lo dado de baja no aparece.
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
import type { DefinicionAbm } from "../../src/casos-uso/abm/definicion.ts";
import { GRUPOS } from "../../src/casos-uso/abm/grupos.ts";
import {
  type Actor,
  crearNombreProceso,
} from "../../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  type FechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type { Transaccional } from "../../src/puertos/repositorios/transaccion.ts";
import {
  ADMIN_UNO,
  OPERADOR,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
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
    hora: 10,
    minuto: 30,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const AYER = fecha(8);
const HOY = fecha(9);

/** La misma tabla, pero solo escribe el administrador (R2). */
const SOLO_ADMINISTRADOR: DefinicionAbm<"Grupo"> = {
  ...GRUPOS,
  rolesQueEscriben: ["administrador"],
};

const OPERADOR_REVOCADO = {
  email: "ex.operador@ejemplo.test",
  rol: "operador",
  estado: "revocado",
} as const;

let admin: Actor;
let operador: Actor;
let revocado: Actor;

function persona(usuario: UsuarioSembrado | undefined): Actor {
  if (usuario === undefined) {
    throw new Error("falta un usuario sembrado");
  }
  return { tipo: "persona", usuarioId: usuario.id };
}

function proceso(): Actor {
  const nombre = crearNombreProceso("proceso-de-prueba");
  if (!nombre.ok) {
    throw new Error(nombre.error);
  }
  return { tipo: "sistema", proceso: nombre.valor };
}

function casos(en: FechaHora = AYER, transaccional?: Transaccional) {
  return crearCasosUsoAbm({
    transaccional: transaccional ?? crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(en),
    generadorId: crearGeneradorIdCrypto(),
  });
}

/** Da de alta un grupo y devuelve su id; falla el test si el alta no pasó. */
async function alta(nombre: string, observaciones = ""): Promise<string> {
  const resultado = await casos().crear(admin, GRUPOS, {
    nombre,
    observaciones,
  });
  if (!resultado.ok) {
    throw new Error(`el alta de "${nombre}" no pasó`);
  }
  return resultado.registro.valor.id;
}

function auditoriaDeGrupos() {
  return cliente().auditoria.findMany({
    where: { entidad: "Grupo" },
    orderBy: { en: "asc" },
  });
}

/** Cuántas filas hay en `grupos` y en `auditoria`: lo que una escritura rechazada no puede mover. */
async function filas() {
  return {
    grupos: await cliente().grupo.count(),
    auditoria: await cliente().auditoria.count(),
  };
}

describe("molde de ABM, con Grupos", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    const sembrados = await sembrarUsuarios(cliente(), [
      ADMIN_UNO,
      OPERADOR,
      OPERADOR_REVOCADO,
    ]);
    admin = persona(sembrados[0]);
    operador = persona(sembrados[1]);
    revocado = persona(sembrados[2]);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("alta", () => {
    test("guarda el registro sin espacios en los extremos, con quién lo creó, y su auditoría", async () => {
      const resultado = await casos().crear(operador, GRUPOS, {
        nombre: "  Grupo Norte ",
        observaciones: "   ",
      });

      expect(resultado.ok).toBe(true);
      const [fila] = await cliente().grupo.findMany();
      expect(fila).toMatchObject({
        nombre: "Grupo Norte",
        observaciones: null,
        creadoPor: operador,
        actualizadoPor: operador,
        eliminadoEn: null,
      });
      const [registro] = await auditoriaDeGrupos();
      expect(registro).toMatchObject({
        entidad: "Grupo",
        entidadId: fila?.id,
        accion: "crear",
        antes: null,
        despues: { id: fila?.id, nombre: "Grupo Norte", observaciones: null },
        actor: operador,
      });
    });

    test("una validación fallida vuelve con el mensaje por campo y no escribe nada", async () => {
      const antes = await filas();

      const resultado = await casos().crear(admin, GRUPOS, {
        nombre: "   ",
        observaciones: "x".repeat(1001),
      });

      expect(resultado).toEqual({
        ok: false,
        errores: {
          nombre: "Escribí el nombre.",
          observaciones:
            "Las observaciones no pueden pasar de 1000 caracteres.",
        },
      });
      expect(await filas()).toEqual(antes);
    });

    test("un nombre repetido, aun con otras mayúsculas y espacios, vuelve con DOM-0008 en ese campo y no escribe nada", async () => {
      await alta("Grupo Norte");
      const antes = await filas();

      const resultado = await casos().crear(admin, GRUPOS, {
        nombre: " grupo NORTE  ",
        observaciones: "",
      });

      expect(resultado).toEqual({
        ok: false,
        errores: { nombre: expect.stringContaining("DOM-0008") },
      });
      expect(await filas()).toEqual(antes);
    });

    test("un nombre parecido no es repetido: los comodines de SQL no cuentan", async () => {
      await alta("Grupo_Norte");
      await alta("100%");

      const parecido = await casos().crear(admin, GRUPOS, {
        nombre: "GrupoXNorte",
        observaciones: "",
      });
      const otro = await casos().crear(admin, GRUPOS, {
        nombre: "100 por ciento",
        observaciones: "",
      });

      expect(parecido.ok).toBe(true);
      expect(otro.ok).toBe(true);
    });

    test("el nombre de un grupo dado de baja se puede volver a usar", async () => {
      const id = await alta("Grupo Norte");
      await casos().marcarEliminado(admin, GRUPOS, id);

      const resultado = await casos().crear(admin, GRUPOS, {
        nombre: "Grupo Norte",
        observaciones: "",
      });

      expect(resultado.ok).toBe(true);
      expect(await cliente().grupo.count()).toBe(2);
    });
  });

  describe("edición", () => {
    test("cambia los datos y deja en auditoría el antes y el después, campo por campo", async () => {
      const id = await alta("Grupo Norte", "Primera nota");

      const resultado = await casos(HOY).guardar(operador, GRUPOS, id, {
        nombre: "Grupo Sur",
        observaciones: "",
      });

      expect(resultado.ok).toBe(true);
      const fila = await cliente().grupo.findUniqueOrThrow({ where: { id } });
      expect(fila).toMatchObject({
        nombre: "Grupo Sur",
        observaciones: null,
        creadoPor: admin,
        actualizadoPor: operador,
      });
      expect(fila.actualizadoEn.getTime()).toBeGreaterThan(
        fila.creadoEn.getTime(),
      );
      const registros = await auditoriaDeGrupos();
      expect(registros).toHaveLength(2);
      expect(registros[1]).toMatchObject({
        entidadId: id,
        accion: "actualizar",
        antes: { id, nombre: "Grupo Norte", observaciones: "Primera nota" },
        despues: { id, nombre: "Grupo Sur", observaciones: null },
        actor: operador,
      });
    });

    test("guardar sin cambiar el nombre no choca consigo mismo", async () => {
      const id = await alta("Grupo Norte");

      const resultado = await casos().guardar(admin, GRUPOS, id, {
        nombre: "GRUPO NORTE",
        observaciones: "Con nota",
      });

      expect(resultado.ok).toBe(true);
    });

    test("guardar lo mismo que ya está no escribe: ni toca la fila ni deja auditoría", async () => {
      const id = await alta("Grupo Norte", "Primera nota");
      const cambio = { nombre: "Grupo Sur", observaciones: "" };
      await casos(HOY).guardar(admin, GRUPOS, id, cambio);
      const antes = await cliente().grupo.findUniqueOrThrow({ where: { id } });

      const otraVez = await casos(fecha(10)).guardar(operador, GRUPOS, id, {
        nombre: "  Grupo Sur ",
        observaciones: "  ",
      });

      expect(otraVez.ok).toBe(true);
      expect(
        await cliente().grupo.findUniqueOrThrow({ where: { id } }),
      ).toEqual(antes);
      const registros = await auditoriaDeGrupos();
      expect(registros.map(({ accion }) => accion)).toEqual([
        "crear",
        "actualizar",
      ]);
    });

    test("el nombre de otro grupo vuelve con DOM-0008 y no cambia nada", async () => {
      await alta("Grupo Norte");
      const id = await alta("Grupo Sur");
      const antes = await filas();

      const resultado = await casos().guardar(admin, GRUPOS, id, {
        nombre: "grupo norte",
        observaciones: "",
      });

      expect(resultado).toEqual({
        ok: false,
        errores: { nombre: expect.stringContaining("DOM-0008") },
      });
      expect(await filas()).toEqual(antes);
      expect(
        await cliente().grupo.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ nombre: "Grupo Sur" });
    });

    test("un id que no existe, o que no es un id, es DOM-0009", async () => {
      const datos = { nombre: "Grupo Norte", observaciones: "" };

      await expect(
        casos().guardar(
          admin,
          GRUPOS,
          "00000000-0000-4000-8000-00000000abcd",
          datos,
        ),
      ).rejects.toMatchObject({ codigo: "DOM-0009" });
      await expect(
        casos().guardar(admin, GRUPOS, "no-es-un-id", datos),
      ).rejects.toMatchObject({ codigo: "DOM-0009" });
      await expect(
        casos().obtener(GRUPOS, "no-es-un-id"),
      ).rejects.toMatchObject({ codigo: "DOM-0009" });
    });
  });

  describe("baja", () => {
    test("es lógica: la fila queda marcada, con su auditoría, y deja de aparecer", async () => {
      const id = await alta("Grupo Norte");
      await alta("Grupo Sur");

      await casos(HOY).marcarEliminado(operador, GRUPOS, id);

      const fila = await cliente().grupo.findUniqueOrThrow({ where: { id } });
      expect(fila.eliminadoEn).not.toBeNull();
      expect(fila).toMatchObject({
        nombre: "Grupo Norte",
        eliminadoPor: operador,
      });
      const registros = await auditoriaDeGrupos();
      expect(registros.at(-1)).toMatchObject({
        entidadId: id,
        accion: "eliminar",
        antes: { id, nombre: "Grupo Norte", observaciones: null },
        despues: {
          id,
          nombre: "Grupo Norte",
          eliminadoEn: "2031-07-09T10:30:00.000",
        },
        actor: operador,
      });
      expect(registros.at(-1)?.antes).not.toHaveProperty("eliminadoEn");
      const listado = await casos().listar(GRUPOS, {});
      expect(listado.total).toBe(1);
      expect(listado.registros.map(({ valor }) => valor.nombre)).toEqual([
        "Grupo Sur",
      ]);
    });

    test("lo dado de baja no se puede ver, editar ni volver a dar de baja: DOM-0009", async () => {
      const id = await alta("Grupo Norte");
      await casos().marcarEliminado(admin, GRUPOS, id);
      const antes = await filas();

      await expect(casos().obtener(GRUPOS, id)).rejects.toMatchObject({
        codigo: "DOM-0009",
      });
      await expect(
        casos().guardar(admin, GRUPOS, id, {
          nombre: "Otro",
          observaciones: "",
        }),
      ).rejects.toMatchObject({ codigo: "DOM-0009" });
      await expect(
        casos().marcarEliminado(admin, GRUPOS, id),
      ).rejects.toMatchObject({ codigo: "DOM-0009" });
      expect(await filas()).toEqual(antes);
    });
  });

  describe("quién escribe", () => {
    test("un operador, si la definición no lo incluye, no da de alta, no edita ni da de baja: AUT-0009 y nada cambia", async () => {
      const id = await alta("Grupo Norte");
      const antes = await filas();
      const datos = { nombre: "Grupo Sur", observaciones: "" };

      await expect(
        casos().crear(operador, SOLO_ADMINISTRADOR, datos),
      ).rejects.toMatchObject({ codigo: "AUT-0009" });
      await expect(
        casos().guardar(operador, SOLO_ADMINISTRADOR, id, datos),
      ).rejects.toMatchObject({ codigo: "AUT-0009" });
      await expect(
        casos().marcarEliminado(operador, SOLO_ADMINISTRADOR, id),
      ).rejects.toMatchObject({ codigo: "AUT-0009" });

      expect(await filas()).toEqual(antes);
      expect(
        await cliente().grupo.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ nombre: "Grupo Norte", eliminadoEn: null });
    });

    test("el administrador sí escribe con esa misma definición", async () => {
      const resultado = await casos().crear(admin, SOLO_ADMINISTRADOR, {
        nombre: "Grupo Norte",
        observaciones: "",
      });

      expect(resultado.ok).toBe(true);
    });

    test.each([
      ["un usuario revocado", () => revocado],
      ["un proceso del sistema", proceso],
    ])(
      "%s tampoco escribe, aunque su rol esté en la definición",
      async (_quien, actor) => {
        const id = await alta("Grupo Norte");
        const antes = await filas();
        const datos = { nombre: "Grupo Sur", observaciones: "" };

        await expect(
          casos().crear(actor(), GRUPOS, datos),
        ).rejects.toMatchObject({ codigo: "AUT-0009" });
        await expect(
          casos().guardar(actor(), GRUPOS, id, datos),
        ).rejects.toMatchObject({ codigo: "AUT-0009" });
        await expect(
          casos().marcarEliminado(actor(), GRUPOS, id),
        ).rejects.toMatchObject({ codigo: "AUT-0009" });

        expect(await filas()).toEqual(antes);
      },
    );
  });

  describe("la auditoría va en la misma transacción", () => {
    /** Un `Transaccional` que deja hacer todo el trabajo y falla justo antes de confirmar. */
    function queFallaAlFinal(): Transaccional {
      const real = crearTransaccionalPrisma(cliente());
      return {
        ejecutar: (trabajo) =>
          real.ejecutar(async (repos) => {
            await trabajo(repos);
            throw new Error("corte de prueba antes de confirmar");
          }),
      };
    }

    test("si la transacción no se confirma, no queda ni el registro ni su auditoría", async () => {
      const id = await alta("Grupo Norte");
      const antes = await filas();
      const conCorte = casos(HOY, queFallaAlFinal());

      await expect(
        conCorte.crear(admin, GRUPOS, {
          nombre: "Grupo Sur",
          observaciones: "",
        }),
      ).rejects.toThrow("corte de prueba");
      await expect(
        conCorte.guardar(admin, GRUPOS, id, {
          nombre: "Grupo Centro",
          observaciones: "",
        }),
      ).rejects.toThrow("corte de prueba");
      await expect(conCorte.marcarEliminado(admin, GRUPOS, id)).rejects.toThrow(
        "corte de prueba",
      );

      expect(await filas()).toEqual(antes);
      expect(
        await cliente().grupo.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ nombre: "Grupo Norte", eliminadoEn: null });
    });
  });

  describe("el único lo garantiza también la base", () => {
    function registro(id: string, nombre: string) {
      return crearAuditable(
        {
          id: identificadorDesde<string>(id),
          nombre,
          observaciones: null,
        },
        admin,
        RelojFijo(AYER),
      );
    }

    test("dos altas con el mismo nombre que esquivan la verificación: la segunda es DOM-0008 y no deja nada", async () => {
      const transaccional = crearTransaccionalPrisma(cliente());
      await transaccional.ejecutar((repos) =>
        repos
          .abm("Grupo")
          .crear(
            admin,
            registro("00000000-0000-4000-8000-0000000000a1", "Grupo Norte"),
          ),
      );
      const antes = await filas();

      await expect(
        transaccional.ejecutar((repos) =>
          repos
            .abm("Grupo")
            .crear(
              admin,
              registro("00000000-0000-4000-8000-0000000000a2", "GRUPO NORTE"),
            ),
        ),
      ).rejects.toMatchObject({ codigo: "DOM-0008" });

      expect(await filas()).toEqual(antes);
    });
  });

  describe("listado", () => {
    /** 60 grupos: "Grupo 01" a "Grupo 60"; los pares llevan una observación. */
    async function sesentaGrupos(): Promise<void> {
      for (let numero = 1; numero <= 60; numero += 1) {
        await alta(
          `Grupo ${String(numero).padStart(2, "0")}`,
          numero % 2 === 0 ? "Zona PAR" : "",
        );
      }
    }

    function nombres(listado: {
      readonly registros: readonly { readonly valor: { nombre: string } }[];
    }): string[] {
      return listado.registros.map(({ valor }) => valor.nombre);
    }

    test("pagina de a 25, ordenado por nombre", async () => {
      await sesentaGrupos();

      const primera = await casos().listar(GRUPOS, {});
      const tercera = await casos().listar(GRUPOS, { pagina: "3" });

      expect(primera).toMatchObject({ total: 60, pagina: 1, paginas: 3 });
      expect(nombres(primera)).toHaveLength(25);
      expect(nombres(primera)[0]).toBe("Grupo 01");
      expect(nombres(primera)[24]).toBe("Grupo 25");
      expect(tercera).toMatchObject({ total: 60, pagina: 3, paginas: 3 });
      expect(nombres(tercera)).toEqual([
        "Grupo 51",
        "Grupo 52",
        "Grupo 53",
        "Grupo 54",
        "Grupo 55",
        "Grupo 56",
        "Grupo 57",
        "Grupo 58",
        "Grupo 59",
        "Grupo 60",
      ]);
    });

    test("ordena al revés si se lo piden", async () => {
      await sesentaGrupos();

      const listado = await casos().listar(GRUPOS, {
        orden: "nombre",
        direccion: "desc",
      });

      expect(listado.direccion).toBe("desc");
      expect(nombres(listado).slice(0, 3)).toEqual([
        "Grupo 60",
        "Grupo 59",
        "Grupo 58",
      ]);
    });

    test("busca lo que contiene, sin distinguir mayúsculas, en todas las columnas declaradas, y pagina el resultado", async () => {
      await sesentaGrupos();

      const porNombre = await casos().listar(GRUPOS, { buscar: "gRuPo 4" });
      const porObservacion = await casos().listar(GRUPOS, {
        buscar: " zona par ",
        pagina: "2",
      });
      const sinResultado = await casos().listar(GRUPOS, { buscar: "nada" });

      expect(porNombre.total).toBe(10);
      expect(nombres(porNombre)[0]).toBe("Grupo 40");
      expect(porObservacion).toMatchObject({
        total: 30,
        pagina: 2,
        paginas: 2,
        buscar: "zona par",
      });
      expect(nombres(porObservacion)).toEqual([
        "Grupo 52",
        "Grupo 54",
        "Grupo 56",
        "Grupo 58",
        "Grupo 60",
      ]);
      expect(sinResultado).toMatchObject({ total: 0, pagina: 1, paginas: 1 });
      expect(sinResultado.registros).toEqual([]);
    });

    test("un parámetro inválido o una columna no declarada caen al valor por defecto", async () => {
      await alta("Grupo Sur");
      await alta("Grupo Norte");

      const listado = await casos().listar(GRUPOS, {
        buscar: ["a", "b"],
        orden: "creadoPor",
        direccion: "de costado",
        pagina: "0",
      });

      expect(listado).toMatchObject({
        buscar: "",
        orden: "nombre",
        direccion: "asc",
        pagina: 1,
        total: 2,
      });
      expect(nombres(listado)).toEqual(["Grupo Norte", "Grupo Sur"]);
    });
  });
});
