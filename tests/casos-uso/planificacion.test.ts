/**
 * F3-02 · El responsable, la fecha estimada, los hitos y los recursos de un
 * servicio, contra el Postgres de verdad del arnés. Se cargan en «Adjudicado»
 * y en «En ejecución»; tildar un hito, solo en «En ejecución». Afuera es
 * `DOM-0018` y no se escribe nada. Datos inventados. Necesita Docker corriendo.
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
import { CAMIONES } from "../../src/casos-uso/abm/camiones.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { crearCasosUsoPlanificacion } from "../../src/casos-uso/servicios/planificacion.ts";
import { crearCasosUsoServicios } from "../../src/casos-uso/servicios/servicios.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  ESTADOS_SERVICIO,
  type EstadoServicio,
} from "../../src/dominio/servicios/estados.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  OPERADOR,
  sembrarUsuarios,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { llevarServicioA, sembrarServicio } from "./_arnes/servicio.ts";

const HOY = (() => {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 10,
    minuto: 30,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
})();

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let admin: Actor;
let operador: Actor;
let servicioId: string;
let camionId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependencias() {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  };
}

const planificacion = () => crearCasosUsoPlanificacion(dependencias());

function llevarA(...recorrido: readonly EstadoServicio[]): Promise<void> {
  return llevarServicioA(
    dependencias().transaccional,
    admin,
    servicioId,
    recorrido,
    HOY,
  );
}

async function estado(): Promise<string | undefined> {
  const [ultimo] = await cliente().servicioEvento.findMany({
    where: { servicioId },
    orderBy: { posicion: "desc" },
    take: 1,
  });
  return ultimo?.a;
}

const fueraDe = (admitidos: readonly EstadoServicio[]) =>
  ESTADOS_SERVICIO.filter((estado) => !admitidos.includes(estado));

const ADJUDICADO_O_EN_EJECUCION = ["adjudicado", "en_ejecucion"] as const;

/** Todo lo que esta tarea puede escribir, para ver que un rechazo no dejó nada. */
async function foto() {
  const db = cliente();
  return {
    servicio: await db.servicio.findUniqueOrThrow({
      where: { id: servicioId },
    }),
    hitos: await db.servicioHito.findMany({ orderBy: { id: "asc" } }),
    recursos: await db.servicioRecurso.findMany({ orderBy: { id: "asc" } }),
    eventos: await db.servicioEvento.count(),
    auditoria: await db.auditoria.count(),
  };
}

/** Lo rechaza con `DOM-0018` y no queda escrito nada. */
async function fueraDeEtapa(trabajo: () => Promise<unknown>): Promise<void> {
  const antes = await foto();
  await expect(trabajo()).rejects.toMatchObject({
    codigo: catalogo.DOM_0018.codigo,
  });
  expect(await foto()).toEqual(antes);
}

function exigirOk<R extends { readonly ok: boolean }>(resultado: R): void {
  expect(resultado, "no pasó").toMatchObject({ ok: true });
}

async function cargarHito(texto = "Armar el cronograma"): Promise<string> {
  exigirOk(await planificacion().crearHito(admin, servicioId, { texto }));
  const hito = await cliente().servicioHito.findFirstOrThrow({
    where: { texto },
  });
  return hito.id;
}

const escritoDeRecurso = (cambios: Escrito = {}): Escrito => ({
  tipo: "persona",
  camionId: "",
  descripcion: "Operador de turno mañana",
  desde: "",
  hasta: "",
  ...cambios,
});

async function cargarRecurso(cambios: Escrito = {}): Promise<string> {
  exigirOk(
    await planificacion().crearRecurso(
      admin,
      servicioId,
      escritoDeRecurso(cambios),
    ),
  );
  const recurso = await cliente().servicioRecurso.findFirstOrThrow({
    orderBy: { creadoEn: "desc" },
  });
  return recurso.id;
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  await limpiarBase();
  const usuarios = await sembrarUsuarios(cliente(), [
    ADMIN_UNO,
    OPERADOR,
    EX_ADMIN,
  ]);
  const [primero, segundo] = usuarios.map(
    ({ id }): Actor => ({ tipo: "persona", usuarioId: id }),
  );
  if (primero === undefined || segundo === undefined) {
    throw new Error("no se sembraron los usuarios");
  }
  [admin, operador] = [primero, segundo];
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    usuarios[0]?.id ?? "",
  );
  const duenio = await cliente().cliente.findFirstOrThrow();
  const camion = await crearCasosUsoAbm(dependencias()).crear(admin, CAMIONES, {
    clienteId: duenio.id,
    tipo: "chasis",
    patenteTractor: "ZZ001ZZ",
    marcaTractor: "Marca Ejemplo",
    anioTractor: "2018",
    patenteCisterna: "",
    marcaCisterna: "",
    anioCisterna: "",
    capacidadLitros: "30000",
  });
  if (!camion.ok) {
    throw new Error("no se pudo dar de alta el camión");
  }
  camionId = camion.registro.valor.id;
  await llevarA("cotizado", "adjudicado");
});

/** El formulario de edición del servicio con lo que ya tiene guardado, más los cambios. */
async function escritoDeServicio(cambios: Escrito = {}): Promise<Escrito> {
  const fila = await cliente().servicio.findUniqueOrThrow({
    where: { id: servicioId },
  });
  return {
    clienteId: fila.clienteId,
    tipoServicioId: fila.tipoServicioId,
    titulo: fila.titulo,
    modalidad: "puntual",
    responsableId: fila.responsableId,
    fechaPedido: "2031-07-01",
    vigenciaDesde: "",
    vigenciaHasta: "",
    observaciones: "",
    fechaInicioEstimada:
      fila.fechaInicioEstimada?.toISOString().slice(0, 10) ?? "",
    ...cambios,
  };
}

const editar = async (cambios: Escrito = {}) =>
  crearCasosUsoServicios(dependencias()).guardar(
    admin,
    servicioId,
    await escritoDeServicio(cambios),
  );

describe("responsable y fecha estimada de inicio (edición del servicio)", () => {
  test("se cambian en «Adjudicado» y en «En ejecución», y se ven en el detalle del servicio", async () => {
    const nuevo = await cliente().usuario.findFirstOrThrow({
      where: { email: OPERADOR.email },
    });

    exigirOk(
      await editar({
        responsableId: nuevo.id,
        fechaInicioEstimada: "2031-08-01",
      }),
    );
    expect(
      await crearCasosUsoServicios(dependencias()).ver(servicioId),
    ).toMatchObject({
      datos: expect.arrayContaining([
        ["Responsable", OPERADOR.email],
        ["Fecha estimada de inicio", "01/08/2031"],
      ]),
    });

    await llevarA("en_ejecucion");
    exigirOk(await editar({ fechaInicioEstimada: "" }));
    expect((await foto()).servicio.fechaInicioEstimada).toBeNull();
  });

  test("un responsable que no es un usuario activo, o una fecha que no es un día, se rechaza al lado del campo", async () => {
    const revocado = await cliente().usuario.findFirstOrThrow({
      where: { email: EX_ADMIN.email },
    });
    const antes = await foto();

    expect(
      await editar({
        responsableId: revocado.id,
        fechaInicioEstimada: "mañana",
      }),
    ).toMatchObject({
      ok: false,
      errores: {
        responsableId: expect.any(String),
        fechaInicioEstimada: expect.any(String),
      },
    });
    expect(await foto()).toEqual(antes);
  });

  test("fuera de «Adjudicado» y «En ejecución», cambiarlos es DOM-0018 y no escribe nada; los demás campos se siguen editando", async () => {
    const nuevo = await cliente().usuario.findFirstOrThrow({
      where: { email: OPERADOR.email },
    });

    for (const afuera of fueraDe(ADJUDICADO_O_EN_EJECUCION)) {
      await llevarA(afuera);
      await fueraDeEtapa(() => editar({ responsableId: nuevo.id }));
      await fueraDeEtapa(() => editar({ fechaInicioEstimada: "2031-08-01" }));
      exigirOk(await editar({ titulo: `Título en ${afuera}` }));
    }
  });
});

describe("hitos", () => {
  test("se arman en «Adjudicado» y en «En ejecución»: el texto se recorta, el orden va al final y la lista sale en ese orden", async () => {
    await planificacion().crearHito(operador, servicioId, {
      texto: "  Armar el cronograma  ",
    });
    await llevarA("en_ejecucion");
    await cargarHito("Coordinar el acceso a planta");

    const { hitos } = await planificacion().ver(servicioId);
    expect(hitos.map(({ texto, realizado }) => [texto, realizado])).toEqual([
      ["Armar el cronograma", null],
      ["Coordinar el acceso a planta", null],
    ]);
    expect(
      (
        await cliente().servicioHito.findMany({ orderBy: { orden: "asc" } })
      ).map(({ orden }) => orden),
    ).toEqual([1, 2]);
  });

  test("un texto vacío o de más de 200 caracteres se rechaza al lado del campo", async () => {
    expect(
      await planificacion().crearHito(admin, servicioId, { texto: "   " }),
    ).toEqual({ ok: false, errores: { texto: "Escribí el hito." } });
    expect(
      await planificacion().crearHito(admin, servicioId, {
        texto: "x".repeat(201),
      }),
    ).toEqual({
      ok: false,
      errores: { texto: "No puede pasar de 200 caracteres." },
    });
  });

  test("se da de baja, con auditoría; lo dado de baja no se lista", async () => {
    const id = await cargarHito();
    const otro = await cargarHito("Entregar el informe");

    await planificacion().marcarEliminadoHito(admin, otro);

    const { hitos } = await planificacion().ver(servicioId);
    expect(hitos.map(({ id: hito }) => hito)).toEqual([id]);
    const filas = await cliente().auditoria.findMany({
      where: { entidad: "ServicioHito" },
    });
    expect(filas.map(({ accion }) => accion).sort()).toEqual([
      "crear",
      "crear",
      "eliminar",
    ]);
  });

  test("en «En ejecución» se tilda con la fecha de hoy y quien lo tilda, y se destilda; tildar de nuevo no cambia nada", async () => {
    const id = await cargarHito();
    await llevarA("en_ejecucion");

    await planificacion().cambiarRealizadoDeHito(operador, id, true);
    expect((await planificacion().ver(servicioId)).hitos[0]).toMatchObject({
      realizado: { fecha: "09/07/2031", autor: OPERADOR.email },
    });

    await planificacion().cambiarRealizadoDeHito(admin, id, true);
    expect((await planificacion().ver(servicioId)).hitos[0]).toMatchObject({
      realizado: { autor: OPERADOR.email },
    });

    await planificacion().cambiarRealizadoDeHito(admin, id, false);
    expect((await planificacion().ver(servicioId)).hitos[0]).toMatchObject({
      realizado: null,
    });
    expect(
      await cliente().servicioHito.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ realizadoEn: null, realizadoPor: null });
  });

  test("tildar fuera de «En ejecución», también en «Adjudicado», es DOM-0018 y no escribe nada", async () => {
    const id = await cargarHito();

    for (const afuera of fueraDe(["en_ejecucion"])) {
      await llevarA(afuera);
      await fueraDeEtapa(() =>
        planificacion().cambiarRealizadoDeHito(admin, id, true),
      );
    }
  });

  test("alta y baja fuera de «Adjudicado» y «En ejecución» son DOM-0018 y no escriben nada", async () => {
    const id = await cargarHito();

    for (const afuera of fueraDe(ADJUDICADO_O_EN_EJECUCION)) {
      await llevarA(afuera);
      await fueraDeEtapa(() =>
        planificacion().crearHito(admin, servicioId, { texto: "Otro hito" }),
      );
      await fueraDeEtapa(() => planificacion().marcarEliminadoHito(admin, id));
    }
  });

  test("un hito que no existe o ya se dio de baja es DOM-0009", async () => {
    const id = await cargarHito();
    await planificacion().marcarEliminadoHito(admin, id);

    for (const inexistente of [id, "no-es-un-id"]) {
      await expect(
        planificacion().marcarEliminadoHito(admin, inexistente),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    }
  });

  test("los hitos no facturan: no tocan facturas ni cobros", async () => {
    await cargarHito();
    await llevarA("en_ejecucion");
    await planificacion().cambiarRealizadoDeHito(
      admin,
      await cargarHito("Segundo hito"),
      true,
    );

    expect(await cliente().factura.count()).toBe(0);
    expect(await cliente().cobro.count()).toBe(0);
  });
});

describe("recursos", () => {
  test("una persona y un equipo llevan descripción; un camión, el camión del ABM; las fechas son opcionales", async () => {
    await cargarRecurso({ desde: "2031-08-01", hasta: "2031-08-31" });
    await cargarRecurso({ tipo: "equipo", descripcion: "Bomba de trasvase" });
    await llevarA("en_ejecucion");
    await cargarRecurso({
      tipo: "camion",
      camionId,
      descripcion: "",
    });

    const { recursos } = await planificacion().ver(servicioId);
    expect(recursos).toEqual([
      {
        id: expect.any(String),
        tipo: "Persona",
        detalle: "Operador de turno mañana",
        desde: "01/08/2031",
        hasta: "31/08/2031",
      },
      {
        id: expect.any(String),
        tipo: "Equipo",
        detalle: "Bomba de trasvase",
        desde: "",
        hasta: "",
      },
      {
        id: expect.any(String),
        tipo: "Camión",
        detalle: "ZZ001ZZ",
        desde: "",
        hasta: "",
      },
    ]);
  });

  test.each([
    [
      "un camión sin camión",
      { tipo: "camion", descripcion: "" },
      { camionId: "Elegí el camión." },
    ],
    [
      "un camión con descripción",
      { tipo: "camion", camionId: "CAMION" },
      { descripcion: "Un camión no lleva descripción: dejala vacía." },
    ],
    [
      "una persona sin descripción",
      { tipo: "persona", descripcion: "" },
      { descripcion: "Escribí la descripción." },
    ],
    [
      "un equipo con camión",
      { tipo: "equipo", camionId: "CAMION" },
      { camionId: "Solo un camión lleva camión: elegí «Ninguno»." },
    ],
    [
      "un hasta anterior al desde",
      { desde: "2031-08-10", hasta: "2031-08-09" },
      { hasta: "No puede ser anterior a «Desde»." },
    ],
    [
      "una descripción de más de 200 caracteres",
      { descripcion: "x".repeat(201) },
      { descripcion: "No puede pasar de 200 caracteres." },
    ],
    [
      "un tipo que no existe",
      { tipo: "helicoptero" },
      { tipo: expect.any(String) },
    ],
  ])(
    "%s se rechaza al lado del campo y no escribe nada",
    async (_caso, cambios, errores) => {
      const antes = await foto();
      const escrito = Object.fromEntries(
        Object.entries(cambios).map(([campo, valor]) => [
          campo,
          valor === "CAMION" ? camionId : valor,
        ]),
      );

      expect(
        await planificacion().crearRecurso(
          admin,
          servicioId,
          escritoDeRecurso(escrito),
        ),
      ).toEqual({ ok: false, errores });
      expect(await foto()).toEqual(antes);
    },
  );

  test("un camión dado de baja o que no existe se rechaza al lado del campo", async () => {
    await crearCasosUsoAbm(dependencias()).marcarEliminado(
      admin,
      CAMIONES,
      camionId,
    );

    for (const elegido of [camionId, "no-es-un-id"]) {
      expect(
        await planificacion().crearRecurso(
          admin,
          servicioId,
          escritoDeRecurso({
            tipo: "camion",
            camionId: elegido,
            descripcion: "",
          }),
        ),
      ).toMatchObject({ ok: false, errores: { camionId: expect.any(String) } });
    }
  });

  test("se da de baja, con su auditoría", async () => {
    const id = await cargarRecurso();

    await planificacion().marcarEliminadoRecurso(admin, id);

    expect((await planificacion().ver(servicioId)).recursos).toEqual([]);
    const filas = await cliente().auditoria.findMany({
      where: { entidad: "ServicioRecurso" },
    });
    expect(filas.map(({ accion }) => accion).sort()).toEqual([
      "crear",
      "eliminar",
    ]);
  });

  test("el formulario de alta ofrece los camiones del ABM", async () => {
    const { elegibles } = await planificacion().formularioDeRecurso();

    expect(elegibles.camionId?.map(({ texto }) => texto)).toEqual(["ZZ001ZZ"]);
  });

  test("alta y baja fuera de «Adjudicado» y «En ejecución» son DOM-0018 y no escriben nada", async () => {
    const id = await cargarRecurso();

    for (const afuera of fueraDe(ADJUDICADO_O_EN_EJECUCION)) {
      await llevarA(afuera);
      await fueraDeEtapa(() =>
        planificacion().crearRecurso(admin, servicioId, escritoDeRecurso()),
      );
      await fueraDeEtapa(() =>
        planificacion().marcarEliminadoRecurso(admin, id),
      );
    }
  });
});

describe("«Iniciar ejecución» no exige nada de esto", () => {
  test("de «Adjudicado» a «En ejecución» sin responsable cambiado, sin fecha, sin hitos y sin recursos", async () => {
    expect(await planificacion().ver(servicioId)).toMatchObject({
      hitos: [],
      recursos: [],
    });
    expect((await foto()).servicio.fechaInicioEstimada).toBeNull();

    await crearCasosUsoServicios(dependencias()).cambiarEstado(
      admin,
      servicioId,
      "en_ejecucion",
      "",
    );

    expect(await estado()).toBe("en_ejecucion");
  });
});
