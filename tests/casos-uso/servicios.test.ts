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
import type { EstadoServicio } from "../../src/dominio/servicios/estados.ts";
import type { EntidadAbm } from "../../src/puertos/repositorios/abm.ts";
import {
  ADMIN_UNO,
  EX_ADMIN,
  OPERADOR,
  sembrarUsuarios,
  type UsuarioSembrado,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { conModalidad, llevarServicioA } from "./_arnes/servicio.ts";

function fechaDelAnio(anio: number) {
  const resultado = crearFechaHora({
    anio,
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
}

const HOY = fechaDelAnio(2031);

/** El `dia` de julio de 2031, a las 10:30. */
function fechaDelDia(dia: number) {
  return { ...HOY, dia };
}

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

function casos(reloj = RelojFijo(HOY)) {
  return crearCasosUsoServicios({ ...dependencias(), reloj });
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
  test("genera el código con el año del reloj y nace creado, con su evento y su auditoría", async () => {
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
        a: "creado",
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

  test("el código lleva el año del reloj y la numeración arranca de nuevo cada año", async () => {
    const en2031 = RelojFijo(HOY);
    const en2032 = RelojFijo(fechaDelAnio(2032));
    const altaEn = async (reloj: ReturnType<typeof RelojFijo>) => {
      const resultado = await casos(reloj).crear(admin, escritoDeServicio());
      if (!resultado.ok) {
        throw new Error(
          `el alta no pasó: ${JSON.stringify(resultado.errores)}`,
        );
      }
      const fila = await cliente().servicio.findUniqueOrThrow({
        where: { id: resultado.id },
      });
      return fila.codigo;
    };

    expect(await altaEn(en2031)).toBe("SRV-2031-001");
    expect(await altaEn(en2031)).toBe("SRV-2031-002");
    expect(await altaEn(en2032)).toBe("SRV-2032-001");
    expect(await altaEn(en2032)).toBe("SRV-2032-002");
    expect(await altaEn(en2031)).toBe("SRV-2031-003");
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
  test("un cambio manual agrega un evento con de, a, cuándo, quién y la nota; ver muestra los días en cada etapa", async () => {
    const id = await alta();
    await llevarServicioA(
      dependencias().transaccional,
      admin,
      id,
      ["cotizado", "adjudicado"],
      HOY,
    );
    await conModalidad(cliente(), id);

    await casos().cambiarEstado(operador, id, "en_ejecucion", "  Arrancó  ");
    await casos(RelojFijo(fechaDelDia(14))).cambiarEstado(
      admin,
      id,
      "finalizado",
      "",
    );

    expect(await eventos(id)).toMatchObject([
      { posicion: 0, de: null, a: "creado", actor: admin, nota: null },
      { posicion: 1, de: "creado", a: "cotizado" },
      { posicion: 2, de: "cotizado", a: "adjudicado" },
      {
        posicion: 3,
        de: "adjudicado",
        a: "en_ejecucion",
        en: new Date("2031-07-09T13:30:00.000Z"),
        actor: operador,
        nota: "Arrancó",
      },
      {
        posicion: 4,
        de: "en_ejecucion",
        a: "finalizado",
        en: new Date("2031-07-14T13:30:00.000Z"),
        actor: admin,
        nota: null,
      },
    ]);
    const detalle = await casos(RelojFijo(fechaDelDia(20))).ver(id);
    expect(detalle.estado).toBe("Finalizado");
    expect(detalle.historial.slice(0, 3)).toEqual([
      {
        posicion: 4,
        cuando: "14/07/2031 10:30",
        de: "En ejecución",
        a: "Finalizado",
        quien: ADMIN_UNO.email,
        nota: "",
        dias: 6,
      },
      {
        posicion: 3,
        cuando: "09/07/2031 10:30",
        de: "Adjudicado",
        a: "En ejecución",
        quien: OPERADOR.email,
        nota: "Arrancó",
        dias: 5,
      },
      {
        posicion: 2,
        cuando: "09/07/2031 10:30",
        de: "Cotizado",
        a: "Adjudicado",
        quien: ADMIN_UNO.email,
        nota: "Armado por el test",
        dias: 0,
      },
    ]);
    expect(detalle.historial.at(-1)).toMatchObject({ a: "Creado", dias: 0 });
    // De «Finalizado» se sale solo cobrando: no hay botones.
    expect(detalle.transiciones).toEqual([]);
  });

  test("ofrece los cambios manuales con el texto de su botón", async () => {
    const id = await alta();
    const transiciones = async (recorrido: readonly EstadoServicio[]) => {
      await llevarServicioA(
        dependencias().transaccional,
        admin,
        id,
        recorrido,
        HOY,
      );
      return (await casos().ver(id)).transiciones;
    };

    expect(await transiciones([])).toEqual([
      { valor: "cancelado", etiqueta: "Pasar a «Cancelado»" },
    ]);
    expect(await transiciones(["cotizado"])).toEqual([
      { valor: "perdido", etiqueta: "Pasar a «Perdido»" },
      { valor: "sin_respuesta", etiqueta: "Pasar a «Sin respuesta»" },
      { valor: "cancelado", etiqueta: "Pasar a «Cancelado»" },
    ]);
    expect(await transiciones(["adjudicado"])).toEqual([
      { valor: "en_ejecucion", etiqueta: "Iniciar ejecución" },
      { valor: "cancelado", etiqueta: "Pasar a «Cancelado»" },
    ]);
    expect(await transiciones(["en_ejecucion"])).toEqual([
      { valor: "finalizado", etiqueta: "Finalizar servicio" },
      { valor: "cancelado", etiqueta: "Pasar a «Cancelado»" },
    ]);
  });

  test("dice en qué etapa está y por cuáles pasó, sin repetir", async () => {
    const id = await alta();
    expect(await casos().ver(id)).toMatchObject({
      etapa: "creado",
      recorridas: ["creado"],
    });
    await llevarServicioA(
      dependencias().transaccional,
      admin,
      id,
      ["cotizado", "adjudicado", "cotizado"],
      HOY,
    );
    expect(await casos().ver(id)).toMatchObject({
      etapa: "cotizado",
      recorridas: ["creado", "cotizado", "adjudicado"],
    });
  });

  test("el cliente que vuelve pasa de «Sin respuesta» a «Cotizado», y perder pide motivo", async () => {
    const id = await alta();
    await llevarServicioA(
      dependencias().transaccional,
      admin,
      id,
      ["cotizado"],
      HOY,
    );

    await casos().cambiarEstado(admin, id, "sin_respuesta", "No contesta");
    await casos().cambiarEstado(admin, id, "cotizado", "");
    await expect(
      casos().cambiarEstado(admin, id, "perdido", "   "),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0017.codigo });
    await casos().cambiarEstado(admin, id, "perdido", "Eligió otra oferta");

    expect((await eventos(id)).map(({ a, nota }) => [a, nota])).toEqual([
      ["creado", null],
      ["cotizado", "Armado por el test"],
      ["sin_respuesta", "No contesta"],
      ["cotizado", null],
      ["perdido", "Eligió otra oferta"],
    ]);
  });

  test.each([
    [
      "una automática pedida a mano (la da cargar una cotización)",
      "cotizado",
      "",
    ],
    ["una que el recorrido no declara", "en_ejecucion", ""],
    ["al mismo estado", "creado", ""],
    ["a un estado que no existe", "archivado", ""],
    ["a uno de los nombres de antes", "solicitado", ""],
    ["con una nota de más de 500 caracteres", "cancelado", "x".repeat(501)],
  ])("%s se rechaza con DOM-0011 y no deja evento", async (_caso, a, nota) => {
    const id = await alta();

    await expect(
      casos().cambiarEstado(admin, id, a, nota),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0011.codigo });

    expect(await eventos(id)).toHaveLength(1);
    expect((await casos().ver(id)).estado).toBe("Creado");
  });

  test.each([
    ["adjudicado", ["cotizado"]],
    ["cerrado", ["cotizado", "adjudicado", "en_ejecucion", "finalizado"]],
  ] as const)(
    "pedir a mano el paso automático a %s se rechaza con DOM-0011",
    async (a, recorrido) => {
      const id = await alta();
      await llevarServicioA(
        dependencias().transaccional,
        admin,
        id,
        recorrido,
        HOY,
      );

      await expect(
        casos().cambiarEstado(admin, id, a, "Lo pido igual"),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0011.codigo });

      expect(await eventos(id)).toHaveLength(1 + recorrido.length);
    },
  );

  test.each([
    ["creado", []],
    ["cotizado", ["cotizado"]],
    ["adjudicado", ["cotizado", "adjudicado"]],
    ["en_ejecucion", ["cotizado", "adjudicado", "en_ejecucion"]],
  ] as const)(
    "cancelar desde %s pide motivo (DOM-0017) y con motivo cancela",
    async (_desde, recorrido) => {
      const id = await alta();
      await llevarServicioA(
        dependencias().transaccional,
        admin,
        id,
        recorrido,
        HOY,
      );

      await expect(
        casos().cambiarEstado(admin, id, "cancelado", ""),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0017.codigo });
      expect(await eventos(id)).toHaveLength(1 + recorrido.length);

      await casos().cambiarEstado(admin, id, "cancelado", "Ya no lo necesita");
      expect((await casos().ver(id)).estado).toBe("Cancelado");
    },
  );

  test("un historial con saltos que hoy no se permiten se muestra igual y sigue desde su estado actual (R3)", async () => {
    const id = await alta();
    // «Creado» → «En ejecución» de un saque: el recorrido de hoy no lo permite.
    await llevarServicioA(
      dependencias().transaccional,
      admin,
      id,
      ["en_ejecucion"],
      HOY,
    );

    const detalle = await casos().ver(id);
    expect(detalle.estado).toBe("En ejecución");
    expect(detalle.historial.map(({ de, a }) => [de, a])).toEqual([
      ["Creado", "En ejecución"],
      ["", "Creado"],
    ]);

    await casos().cambiarEstado(admin, id, "finalizado", "");
    expect((await casos().ver(id)).estado).toBe("Finalizado");
  });

  // Los dos piden el mismo cambio: entren a la vez o uno detrás del otro, el segundo ya no vale.
  test("de dos cambios simultáneos desde el mismo estado entra uno solo", async () => {
    const id = await alta();

    const resultados = await Promise.allSettled([
      casos().cambiarEstado(admin, id, "cancelado", "Uno"),
      casos().cambiarEstado(operador, id, "cancelado", "Otro"),
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
          de: "creado",
          a: "cancelado",
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
      casos().cambiarEstado(admin, "no-es-un-id", "cancelado", "Motivo"),
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
  test("un servicio creado se da de baja y deja de listarse", async () => {
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
    await casos().cambiarEstado(admin, id, "cancelado", "Ya no lo necesita");

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

  test("un cliente que solo tiene el servicio no se da de baja hasta que el servicio se da de baja", async () => {
    const soloConServicio = await altaDeCliente(
      "Cliente Sin Sitios S.A.",
      "30-00000003-1",
    );
    const id = await alta({ clienteId: soloConServicio });
    const abm = crearCasosUsoAbm(dependencias());

    await expect(
      abm.marcarEliminado(admin, CLIENTES, soloConServicio),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0010.codigo });

    await casos().marcarEliminado(admin, id);
    await abm.marcarEliminado(admin, CLIENTES, soloConServicio);
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
        () => casos().cambiarEstado(actor, id, "cancelado", "Motivo"),
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
    const { transaccional } = dependencias();
    await llevarServicioA(transaccional, admin, segundo, ["cotizado"], HOY);
    await llevarServicioA(transaccional, admin, tercero, ["cotizado"], HOY);
    await casos().cambiarEstado(admin, tercero, "sin_respuesta", "No contesta");
    await casos().cambiarEstado(admin, tercero, "cotizado", "");
    await casos().cambiarEstado(admin, tercero, "perdido", "Eligió otra");
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
    expect(await codigos({ clienteId: otroCliente, estado: "creado" })).toEqual(
      [],
    );
    // Un filtro que no es de la lista no filtra.
    expect(await codigos({ estado: "archivado" })).toHaveLength(3);

    const { filtros } = await casos().listar({ estado: "perdido" });
    expect(filtros.map(({ columna, elegido }) => [columna, elegido])).toEqual([
      ["estado", "perdido"],
      ["clienteId", ""],
    ]);
    expect(filtros[0]?.opciones).toHaveLength(9);
    expect(filtros[1]?.opciones.map(({ texto }) => texto)).toEqual([
      "Cantera Inventada S.R.L.",
      "Minera Ejemplo S.A.",
    ]);
  });

  test("pagina de a 25 en la base", async () => {
    for (let numero = 0; numero < 26; numero += 1) {
      await alta({ titulo: `Servicio de ejemplo ${numero}` });
    }

    const primera = await casos().listar({
      pagina: "1",
      orden: "codigo",
      direccion: "asc",
    });
    const segunda = await casos().listar({
      pagina: "2",
      orden: "codigo",
      direccion: "asc",
    });

    expect(primera).toMatchObject({ total: 26, pagina: 1, paginas: 2 });
    expect(primera.registros).toHaveLength(25);
    expect(segunda).toMatchObject({ total: 26, pagina: 2, paginas: 2 });
    expect(segunda.registros).toHaveLength(1);
    expect(segunda.celdas[segunda.registros[0]?.valor.id ?? ""]?.[0]).toBe(
      "SRV-2031-026",
    );
  });
});
