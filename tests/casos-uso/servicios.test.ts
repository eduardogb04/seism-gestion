/**
 * Servicios (F2-04, ADR 0033) contra el Postgres de verdad del arnés: el
 * código generado (también con altas simultáneas), el estado como historial
 * de eventos, la vigencia, los sitios de su cliente, la baja y la regla de
 * "en uso" sobre clientes, tipos y sitios.
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
import { crearSecuenciasPrisma } from "../../src/adaptadores/prisma/secuencias.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import { CLIENTES } from "../../src/casos-uso/abm/clientes.ts";
import type {
  DefinicionAbm,
  Escrito,
} from "../../src/casos-uso/abm/definicion.ts";
import { SITIOS } from "../../src/casos-uso/abm/sitios.ts";
import { TIPOS_DE_SERVICIO } from "../../src/casos-uso/abm/tipos-de-servicio.ts";
import { crearCasosUsoServicios } from "../../src/casos-uso/servicios/servicios.ts";
import {
  type Actor,
  crearNombreProceso,
} from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type { EntidadAbm } from "../../src/puertos/repositorios/abm.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  OPERADOR,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

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
let usuarios: readonly UsuarioSembrado[];
let admin: Actor;
let operador: Actor;
let clienteId: string;
let tipoId: string;

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

function casos() {
  return crearCasosUsoServicios(dependencias());
}

function persona(indice: number): Actor {
  const usuario = usuarios[indice];
  if (usuario === undefined) {
    throw new Error(`no se sembró el usuario ${indice}`);
  }
  return { tipo: "persona", usuarioId: usuario.id };
}

async function altaAbm<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  escrito: Escrito,
): Promise<string> {
  const resultado = await crearCasosUsoAbm(dependencias()).crear(
    admin,
    definicion,
    escrito,
  );
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.registro.valor.id;
}

function altaDeCliente(
  razonSocial: string,
  cuit: string,
  esCliente = true,
): Promise<string> {
  return altaAbm(CLIENTES, {
    razonSocial,
    cuit,
    condicionIva: "responsable_inscripto",
    domicilio: "Calle Falsa 123",
    localidad: "Ciudad Ejemplo",
    provincia: "cordoba",
    codigoPostal: "X5000",
    esCliente: esCliente ? "si" : "",
    esProveedor: esCliente ? "" : "si",
  });
}

function altaDeTipo(nombre: string, activo = true): Promise<string> {
  return altaAbm(TIPOS_DE_SERVICIO, {
    nombre,
    descripcion: "",
    modalidad: "puntual",
    activo: activo ? "si" : "",
  });
}

function altaDeSitio(deCliente: string, nombre: string): Promise<string> {
  return altaAbm(SITIOS, {
    clienteId: deCliente,
    nombre,
    provincia: "cordoba",
    localidad: "Ciudad Ejemplo",
    direccion: "",
    latitud: "",
    longitud: "",
    cantidadTanques: "2",
    capacidadTotalLitros: "1000",
    observaciones: "",
  });
}

function escritoDeServicio(cambios: Escrito = {}): Escrito {
  return {
    clienteId,
    tipoServicioId: tipoId,
    titulo: "Auditoría de tanques — ejemplo",
    modalidad: "puntual",
    responsableId: usuarios[0]?.id ?? "",
    fechaPedido: "2031-07-01",
    vigenciaDesde: "",
    vigenciaHasta: "",
    observaciones: "",
    ...cambios,
  };
}

async function alta(cambios: Escrito = {}, actor = admin): Promise<string> {
  const resultado = await casos().crear(actor, escritoDeServicio(cambios));
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.id;
}

async function erroresDelAlta(cambios: Escrito) {
  const resultado = await casos().crear(admin, escritoDeServicio(cambios));
  return resultado.ok ? {} : resultado.errores;
}

function eventos(id: string) {
  return cliente().servicioEvento.findMany({
    where: { servicioId: id },
    orderBy: { posicion: "asc" },
  });
}

async function codigos(parametros: Readonly<Record<string, unknown>> = {}) {
  const { registros, celdas } = await casos().listar(parametros);
  return registros.map(({ valor }) => celdas[valor.id]?.[0]);
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  await limpiarBase();
  usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO, OPERADOR, EX_ADMIN]);
  admin = persona(0);
  operador = persona(1);
  clienteId = await altaDeCliente("Minera Ejemplo S.A.", "30-00000001-5");
  tipoId = await altaDeTipo("Auditoría de ejemplo");
});

describe("alta", () => {
  test("genera el código con el año del reloj y nace solicitado, con su evento y su auditoría", async () => {
    const id = await alta();
    const otro = await alta({ titulo: "Segundo de ejemplo" });

    const fila = await cliente().servicio.findUniqueOrThrow({ where: { id } });
    expect(fila.codigo).toBe("SRV-2031-001");
    expect(
      (await cliente().servicio.findUniqueOrThrow({ where: { id: otro } }))
        .codigo,
    ).toBe("SRV-2031-002");
    expect(fila.creadoPor).toEqual(admin);
    expect(await eventos(id)).toEqual([
      {
        servicioId: id,
        posicion: 0,
        de: null,
        a: "solicitado",
        en: new Date("2031-07-09T13:30:00.000Z"),
        actor: admin,
        nota: null,
      },
    ]);
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "Servicio", entidadId: id },
    });
    expect(auditoria.map(({ accion }) => accion)).toEqual(["crear"]);
    expect(auditoria[0]?.despues).toMatchObject({
      codigo: "SRV-2031-001",
      fechaPedido: "2031-07-01",
    });
  });

  test("doce altas a la vez no repiten código ni saltean ninguno", async () => {
    const ids = await Promise.all(
      Array.from({ length: 12 }, (_, numero) =>
        alta({ titulo: `Simultáneo ${numero}` }),
      ),
    );

    const filas = await cliente().servicio.findMany({
      where: { id: { in: ids } },
    });
    expect(filas.map(({ codigo }) => codigo).sort()).toEqual(
      Array.from(
        { length: 12 },
        (_, numero) => `SRV-2031-${String(numero + 1).padStart(3, "0")}`,
      ),
    );
  });

  test("un alta rechazada no gasta número", async () => {
    expect(await erroresDelAlta({ titulo: "" })).toEqual({
      titulo: "Escribí el título.",
    });

    expect(await cliente().secuencia.count()).toBe(0);
    await alta();
    expect(await codigos()).toEqual(["SRV-2031-001"]);
  });

  test("la secuencia es una por prefijo y año, y empieza en 1", async () => {
    const secuencias = crearSecuenciasPrisma(cliente());

    expect(await secuencias.siguiente("SRV", 2031)).toBe(1);
    expect(await secuencias.siguiente("SRV", 2031)).toBe(2);
    expect(await secuencias.siguiente("SRV", 2032)).toBe(1);
    expect(await secuencias.siguiente("COT", 2031)).toBe(1);
    expect(
      (
        await Promise.all(
          Array.from({ length: 10 }, () => secuencias.siguiente("SRV", 2031)),
        )
      ).sort((a, b) => a - b),
    ).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  test("lo obligatorio vuelve al lado de su campo", async () => {
    expect(
      await erroresDelAlta({
        clienteId: "",
        tipoServicioId: "",
        titulo: "x".repeat(161),
        modalidad: "",
        responsableId: "",
        fechaPedido: "",
      }),
    ).toEqual({
      clienteId: "Elegí un cliente.",
      tipoServicioId: "Elegí un tipo de servicio.",
      titulo: "No puede pasar de 160 caracteres.",
      modalidad: "Elegí una de las opciones de la lista.",
      responsableId: "Elegí una de las opciones de la lista.",
      fechaPedido: "Elegí una fecha.",
    });
  });

  test("solo se elige un cliente marcado como cliente, un tipo activo y un usuario activo", async () => {
    const proveedor = await altaDeCliente(
      "Proveedora Ejemplo S.A.",
      "30-00000002-3",
      false,
    );
    const inactivo = await altaDeTipo("Tipo en desuso", false);

    expect(
      await erroresDelAlta({ responsableId: usuarios[2]?.id ?? "" }),
    ).toEqual({ responsableId: "Elegí una de las opciones de la lista." });
    expect(
      await erroresDelAlta({ clienteId: proveedor, tipoServicioId: inactivo }),
    ).toEqual({
      clienteId: "Elegí una de las opciones de la lista.",
      tipoServicioId: "Elegí una de las opciones de la lista.",
    });

    const { elegibles, campos, escrito } = await casos().formulario();
    expect(elegibles.clienteId?.map(({ texto }) => texto)).toEqual([
      "Minera Ejemplo S.A.",
    ]);
    expect(elegibles.tipoServicioId?.map(({ texto }) => texto)).toEqual([
      "Auditoría de ejemplo",
    ]);
    expect(
      campos.find(([nombre]) => nombre === "responsableId")?.[1],
    ).toMatchObject({
      opciones: [
        { valor: usuarios[0]?.id, etiqueta: ADMIN_UNO.email },
        { valor: usuarios[1]?.id, etiqueta: OPERADOR.email },
      ],
    });
    expect(escrito).toEqual({ modalidad: "puntual" });
  });
});

describe("vigencia", () => {
  test("un servicio recurrente la lleva completa", async () => {
    expect(await erroresDelAlta({ modalidad: "recurrente" })).toEqual({
      vigenciaDesde: "Un servicio recurrente lleva vigencia: elegí la fecha.",
      vigenciaHasta: "Un servicio recurrente lleva vigencia: elegí la fecha.",
    });
    expect(
      await erroresDelAlta({
        modalidad: "recurrente",
        vigenciaDesde: "2031-08-01",
      }),
    ).toEqual({
      vigenciaHasta: "Un servicio recurrente lleva vigencia: elegí la fecha.",
    });
  });

  test("hasta no puede ser anterior a desde, pero sí el mismo día", async () => {
    expect(
      await erroresDelAlta({
        modalidad: "recurrente",
        vigenciaDesde: "2031-08-02",
        vigenciaHasta: "2031-08-01",
      }),
    ).toEqual({ vigenciaHasta: "No puede ser anterior a «Vigencia desde»." });

    const id = await alta({
      modalidad: "recurrente",
      vigenciaDesde: "2031-08-01",
      vigenciaHasta: "2031-08-01",
    });
    expect((await casos().ver(id)).datos).toContainEqual([
      "Vigencia",
      "01/08/2031 a 01/08/2031",
    ]);
  });

  test("un servicio puntual no la lleva", async () => {
    expect(
      await erroresDelAlta({
        vigenciaDesde: "2031-08-01",
        vigenciaHasta: "2031-09-01",
      }),
    ).toEqual({
      vigenciaDesde: "Un servicio puntual no lleva vigencia: dejala vacía.",
      vigenciaHasta: "Un servicio puntual no lleva vigencia: dejala vacía.",
    });
    expect(
      (await casos().ver(await alta())).datos.map(([etiqueta]) => etiqueta),
    ).not.toContain("Vigencia");
  });
});

describe("cambio de estado", () => {
  test("una transición del ciclo agrega un evento con de, a, cuándo, quién y la nota", async () => {
    const id = await alta();

    await casos().cambiarEstado(operador, id, "cotizado", "  Se envió  ");
    await casos().cambiarEstado(admin, id, "adjudicado", "");

    expect(await eventos(id)).toMatchObject([
      { posicion: 0, de: null, a: "solicitado", actor: admin, nota: null },
      {
        posicion: 1,
        de: "solicitado",
        a: "cotizado",
        en: new Date("2031-07-09T13:30:00.000Z"),
        actor: operador,
        nota: "Se envió",
      },
      {
        posicion: 2,
        de: "cotizado",
        a: "adjudicado",
        actor: admin,
        nota: null,
      },
    ]);
    const detalle = await casos().ver(id);
    expect(detalle.estado).toBe("Adjudicado");
    expect(detalle.historial).toEqual([
      {
        cuando: "09/07/2031 10:30",
        de: "Cotizado",
        a: "Adjudicado",
        quien: ADMIN_UNO.email,
        nota: "",
      },
      {
        cuando: "09/07/2031 10:30",
        de: "Solicitado",
        a: "Cotizado",
        quien: OPERADOR.email,
        nota: "Se envió",
      },
      {
        cuando: "09/07/2031 10:30",
        de: "",
        a: "Solicitado",
        quien: ADMIN_UNO.email,
        nota: "",
      },
    ]);
    expect(detalle.transiciones).toEqual([
      { valor: "vigente", etiqueta: "Vigente" },
      { valor: "perdido", etiqueta: "Perdido" },
      { valor: "sin_respuesta", etiqueta: "Sin respuesta" },
      { valor: "cancelado", etiqueta: "Cancelado" },
    ]);
  });

  test.each([
    ["una que el ciclo no declara", "vigente", ""],
    ["al mismo estado", "solicitado", ""],
    ["a un estado que no existe", "archivado", ""],
    ["con una nota de más de 500 caracteres", "cotizado", "x".repeat(501)],
  ])("%s se rechaza con DOM-0011 y no deja evento", async (_caso, a, nota) => {
    const id = await alta();

    await expect(
      casos().cambiarEstado(admin, id, a, nota),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0011.codigo });

    expect(await eventos(id)).toHaveLength(1);
    expect((await casos().ver(id)).estado).toBe("Solicitado");
  });

  // Los dos piden el mismo cambio: entren a la vez o uno detrás del otro, el segundo ya no vale.
  test("de dos cambios simultáneos desde el mismo estado entra uno solo", async () => {
    const id = await alta();

    const resultados = await Promise.allSettled([
      casos().cambiarEstado(admin, id, "cotizado", ""),
      casos().cambiarEstado(operador, id, "cotizado", ""),
    ]);

    expect(resultados.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      resultados.find(({ status }) => status === "rejected"),
    ).toMatchObject({ reason: { codigo: catalogo.DOM_0011.codigo } });
    expect(await eventos(id)).toHaveLength(2);
  });

  test("la base no deja dos eventos en la misma posición: el que llega segundo es DOM-0011", async () => {
    const id = await alta();

    await expect(
      dependencias().transaccional.ejecutar((repos) =>
        repos.servicios.agregarEvento(admin, id, {
          de: "solicitado",
          a: "perdido",
          en: HOY,
          origen: null,
          posicion: 0,
        }),
      ),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0011.codigo });

    expect(await eventos(id)).toHaveLength(1);
  });

  test("un servicio que no existe es DOM-0009", async () => {
    await expect(
      casos().cambiarEstado(admin, "no-es-un-id", "cotizado", ""),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
  });
});

describe("sitios que abarca", () => {
  test("guarda el conjunto de sitios de su cliente y deja auditoría del cambio", async () => {
    const norte = await altaDeSitio(clienteId, "Planta Norte");
    const sur = await altaDeSitio(clienteId, "Planta Sur");
    const id = await alta();

    await casos().guardarSitios(operador, id, [norte, sur, norte]);
    await casos().guardarSitios(operador, id, [sur]);
    // El mismo conjunto no vuelve a escribir.
    await casos().guardarSitios(operador, id, [sur]);

    expect((await casos().ver(id)).sitios).toEqual([
      { id: norte, nombre: "Planta Norte", marcado: false },
      { id: sur, nombre: "Planta Sur", marcado: true },
    ]);
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "Servicio", entidadId: id, accion: "actualizar" },
    });
    const cambios = auditoria.map(({ antes, despues }) => [antes, despues]);
    expect(cambios).toHaveLength(2);
    expect(cambios).toContainEqual([
      { sitios: [] },
      { sitios: [norte, sur].sort() },
    ]);
    expect(cambios).toContainEqual([
      { sitios: [norte, sur].sort() },
      { sitios: [sur] },
    ]);
    expect(auditoria.map(({ actor }) => actor)).toEqual([operador, operador]);
  });

  test("un sitio de otro cliente, uno dado de baja o uno que no existe se rechazan sin guardar nada", async () => {
    const propio = await altaDeSitio(clienteId, "Planta Norte");
    const otroCliente = await altaDeCliente(
      "Otra Minera S.A.",
      "30-00000003-1",
    );
    const ajeno = await altaDeSitio(otroCliente, "Planta Ajena");
    const dadoDeBaja = await altaDeSitio(clienteId, "Planta Cerrada");
    await crearCasosUsoAbm(dependencias()).marcarEliminado(
      admin,
      SITIOS,
      dadoDeBaja,
    );
    const id = await alta();

    for (const malo of [
      ajeno,
      dadoDeBaja,
      "no-es-un-id",
      crypto.randomUUID(),
    ]) {
      await expect(
        casos().guardarSitios(admin, id, [propio, malo]),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    }

    expect(await cliente().servicioSitio.count()).toBe(0);
  });

  test("no se cambia el cliente de un servicio que ya abarca sitios", async () => {
    const sitio = await altaDeSitio(clienteId, "Planta Norte");
    const otroCliente = await altaDeCliente(
      "Otra Minera S.A.",
      "30-00000003-1",
    );
    const id = await alta();
    await casos().guardarSitios(admin, id, [sitio]);

    expect(
      await casos().guardar(
        admin,
        id,
        escritoDeServicio({ clienteId: otroCliente }),
      ),
    ).toEqual({
      ok: false,
      errores: {
        clienteId:
          "Este servicio abarca sitios de su cliente: desmarcalos antes de cambiarlo.",
      },
    });

    await casos().guardarSitios(admin, id, []);
    expect(
      await casos().guardar(
        admin,
        id,
        escritoDeServicio({ clienteId: otroCliente }),
      ),
    ).toEqual({ ok: true, id });
  });
});

describe("edición", () => {
  test("cambia los datos, no el código, y guardar sin cambios no audita", async () => {
    const id = await alta();

    await casos().guardar(operador, id, escritoDeServicio());
    await casos().guardar(
      operador,
      id,
      escritoDeServicio({ titulo: "Otro título de ejemplo" }),
    );

    const fila = await cliente().servicio.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({
      codigo: "SRV-2031-001",
      titulo: "Otro título de ejemplo",
      actualizadoPor: operador,
    });
    expect(
      await cliente().auditoria.count({
        where: { entidad: "Servicio", entidadId: id },
      }),
    ).toBe(2);
    expect((await casos().formulario(id)).escrito).toEqual({
      clienteId,
      tipoServicioId: tipoId,
      titulo: "Otro título de ejemplo",
      modalidad: "puntual",
      responsableId: usuarios[0]?.id,
      fechaPedido: "2031-07-01",
    });
  });
});

describe("baja y en uso", () => {
  test("un servicio solicitado se da de baja y deja de listarse", async () => {
    const id = await alta();

    await casos().marcarEliminado(operador, id);

    expect(await codigos()).toEqual([]);
    expect(
      (await cliente().servicio.findUniqueOrThrow({ where: { id } }))
        .eliminadoEn,
    ).not.toBeNull();
    await expect(casos().ver(id)).rejects.toMatchObject({
      codigo: catalogo.DOM_0009.codigo,
    });
  });

  test("uno que ya avanzó no se da de baja: DOM-0011", async () => {
    const id = await alta();
    expect((await casos().ver(id)).admiteBaja).toBe(true);
    await casos().cambiarEstado(admin, id, "cotizado", "");

    await expect(casos().marcarEliminado(admin, id)).rejects.toMatchObject({
      codigo: catalogo.DOM_0011.codigo,
    });

    expect((await casos().ver(id)).admiteBaja).toBe(false);
    expect(await codigos()).toEqual(["SRV-2031-001"]);
  });

  test("su cliente, su tipo y un sitio que abarca no se dan de baja mientras el servicio esté vigente", async () => {
    const sitio = await altaDeSitio(clienteId, "Planta Norte");
    const sinMarcar = await altaDeSitio(clienteId, "Planta Sur");
    const id = await alta();
    await casos().guardarSitios(admin, id, [sitio]);
    const abm = crearCasosUsoAbm(dependencias());

    await expect(
      abm.marcarEliminado(admin, CLIENTES, clienteId),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });
    await expect(
      abm.marcarEliminado(admin, TIPOS_DE_SERVICIO, tipoId),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });
    await expect(
      abm.marcarEliminado(admin, SITIOS, sitio),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });

    await abm.marcarEliminado(admin, SITIOS, sinMarcar);
    await casos().marcarEliminado(admin, id);
    await abm.marcarEliminado(admin, SITIOS, sitio);
    await abm.marcarEliminado(admin, TIPOS_DE_SERVICIO, tipoId);
    await abm.marcarEliminado(admin, CLIENTES, clienteId);
  });
});

describe("quién escribe", () => {
  test("el operador puede; un usuario revocado y un proceso del sistema, no", async () => {
    const id = await alta({}, operador);
    const proceso = crearNombreProceso("proceso-de-prueba");
    if (!proceso.ok) {
      throw new Error(proceso.error);
    }

    for (const actor of [
      persona(2),
      { tipo: "sistema", proceso: proceso.valor } as const,
    ]) {
      for (const escritura of [
        () => casos().crear(actor, escritoDeServicio()),
        () => casos().guardar(actor, id, escritoDeServicio({ titulo: "No" })),
        () => casos().cambiarEstado(actor, id, "cotizado", ""),
        () => casos().guardarSitios(actor, id, []),
        () => casos().marcarEliminado(actor, id),
      ]) {
        await expect(escritura()).rejects.toMatchObject({
          codigo: catalogo.AUT_0009.codigo,
        });
      }
    }

    expect(await codigos()).toEqual(["SRV-2031-001"]);
    expect(await eventos(id)).toHaveLength(1);
  });
});

describe("listado", () => {
  async function tres(): Promise<readonly string[]> {
    const otroCliente = await altaDeCliente(
      "Cantera Inventada S.R.L.",
      "30-00000003-1",
    );
    const primero = await alta({ fechaPedido: "2031-07-01" });
    const segundo = await alta({
      titulo: "Calibración de ejemplo",
      fechaPedido: "2031-07-05",
      clienteId: otroCliente,
    });
    const tercero = await alta({
      titulo: "Relevamiento de ejemplo",
      fechaPedido: "2031-07-03",
    });
    await casos().cambiarEstado(admin, segundo, "cotizado", "");
    await casos().cambiarEstado(admin, tercero, "sin_respuesta", "");
    await casos().cambiarEstado(admin, tercero, "cotizado", "");
    await casos().cambiarEstado(admin, tercero, "perdido", "");
    return [primero, segundo, tercero, otroCliente];
  }

  test("muestra cada servicio con su cliente, su tipo, su estado actual y su responsable, lo más nuevo primero", async () => {
    const [primero, segundo, tercero] = await tres();

    const listado = await casos().listar({});

    expect(listado.registros.map(({ valor }) => valor.id)).toEqual([
      segundo,
      tercero,
      primero,
    ]);
    expect(listado.celdas[tercero ?? ""]).toEqual([
      "SRV-2031-003",
      "Relevamiento de ejemplo",
      "Minera Ejemplo S.A.",
      "Auditoría de ejemplo",
      "Perdido",
      ADMIN_UNO.email,
      "03/07/2031",
    ]);
    expect(listado).toMatchObject({
      total: 3,
      pagina: 1,
      paginas: 1,
      orden: "fechaPedido",
      direccion: "desc",
    });
    expect(listado.cabeceras).toHaveLength(7);
  });

  test("ordena por código y busca por código, título o razón social del cliente", async () => {
    await tres();

    expect(await codigos({ orden: "codigo", direccion: "asc" })).toEqual([
      "SRV-2031-001",
      "SRV-2031-002",
      "SRV-2031-003",
    ]);
    expect(await codigos({ buscar: "srv-2031-002" })).toEqual(["SRV-2031-002"]);
    expect(await codigos({ buscar: "RELEVAMIENTO" })).toEqual(["SRV-2031-003"]);
    expect(await codigos({ buscar: "cantera" })).toEqual(["SRV-2031-002"]);
    expect(await codigos({ buscar: "no hay ninguno así" })).toEqual([]);
  });

  test("filtra por el estado actual (no por uno por el que pasó) y por cliente", async () => {
    const [, , , otroCliente] = await tres();

    expect(await codigos({ estado: "cotizado" })).toEqual(["SRV-2031-002"]);
    expect(await codigos({ estado: "perdido" })).toEqual(["SRV-2031-003"]);
    expect(await codigos({ estado: "sin_respuesta" })).toEqual([]);
    expect(await codigos({ clienteId: otroCliente })).toEqual(["SRV-2031-002"]);
    expect(
      await codigos({ clienteId: otroCliente, estado: "solicitado" }),
    ).toEqual([]);
    // Un filtro que no es de la lista no filtra.
    expect(await codigos({ estado: "archivado" })).toHaveLength(3);

    const { filtros } = await casos().listar({ estado: "perdido" });
    expect(filtros.map(({ columna, elegido }) => [columna, elegido])).toEqual([
      ["estado", "perdido"],
      ["clienteId", ""],
    ]);
    expect(filtros[0]?.opciones).toHaveLength(8);
    expect(filtros[1]?.opciones.map(({ texto }) => texto)).toEqual([
      "Cantera Inventada S.R.L.",
      "Minera Ejemplo S.A.",
    ]);
  });

  test("pagina de a 25 en la base", async () => {
    for (let numero = 0; numero < 26; numero += 1) {
      await alta({ titulo: `Servicio de ejemplo ${numero}` });
    }

    const segunda = await casos().listar({ pagina: "2", orden: "codigo" });

    expect(segunda).toMatchObject({ total: 26, pagina: 2, paginas: 2 });
    expect(segunda.registros).toHaveLength(1);
  });
});
