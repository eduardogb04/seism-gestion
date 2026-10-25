/**
 * F3-01 · El recorrido de un servicio por etapas, sobre el historial de F0-21.
 *
 * Las tablas de abajo están escritas a mano, aparte de las del dominio: si
 * alguien agrega, quita o cambia de causa una transición allá, acá se ve.
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  type FechaHora,
  sumarDias,
} from "../../src/dominio/compartido/reloj.ts";
import {
  admiteBaja,
  admiteCarga,
  type Carga,
  type Causa,
  cicloServicio,
  diasPorEtapa,
  ESTADO_INICIAL,
  ESTADOS_SERVICIO,
  type EstadoServicio,
  type HistorialServicio,
  pedirCambio,
  porCausa,
  transicionesManualesDesde,
} from "../../src/dominio/servicios/estados.ts";
import { configuracion } from "./_arnes/propiedad.ts";

/** Las que pide la persona desde la pantalla. */
const MANUALES: Readonly<Record<EstadoServicio, readonly EstadoServicio[]>> = {
  creado: ["cancelado"],
  cotizado: ["perdido", "sin_respuesta", "cancelado"],
  adjudicado: ["en_ejecucion", "cancelado"],
  en_ejecucion: ["finalizado", "cancelado"],
  finalizado: [],
  cerrado: [],
  perdido: [],
  sin_respuesta: ["cotizado"],
  cancelado: [],
};

/** Las que solo dispara su causa: de dónde a dónde. */
const AUTOMATICAS: Readonly<
  Record<Causa, readonly [EstadoServicio, EstadoServicio]>
> = {
  cotizacion: ["creado", "cotizado"],
  ordenDeCompra: ["cotizado", "adjudicado"],
  anulacionDeOrdenDeCompra: ["adjudicado", "cotizado"],
  cobrado: ["finalizado", "cerrado"],
};

const CAUSAS: readonly Causa[] = [
  "cotizacion",
  "ordenDeCompra",
  "anulacionDeOrdenDeCompra",
  "cobrado",
];

const PIDEN_MOTIVO: readonly EstadoServicio[] = [
  "perdido",
  "sin_respuesta",
  "cancelado",
];

const MENOS_CERRADO = ESTADOS_SERVICIO.filter((estado) => estado !== "cerrado");

const ETAPAS: Readonly<Record<Carga, readonly EstadoServicio[]>> = {
  cotizacion: ["creado", "cotizado"],
  ordenDeCompra: ["cotizado"],
  anulacionDeOrdenDeCompra: ["adjudicado"],
  factura: ["adjudicado", "en_ejecucion", "finalizado"],
  cobro: MENOS_CERRADO,
  suceso: MENOS_CERRADO,
  planificacion: ["adjudicado", "en_ejecucion"],
  tildarHito: ["en_ejecucion"],
  modalidad: ["adjudicado", "en_ejecucion"],
  vencimiento: ["finalizado"],
};

const CARGAS: readonly Carga[] = [
  "cotizacion",
  "ordenDeCompra",
  "anulacionDeOrdenDeCompra",
  "factura",
  "cobro",
  "suceso",
  "planificacion",
  "tildarHito",
  "modalidad",
  "vencimiento",
];

function declarada(de: EstadoServicio, a: EstadoServicio): boolean {
  return (
    MANUALES[de].includes(a) ||
    Object.values(AUTOMATICAS).some(
      ([desde, hasta]) => desde === de && hasta === a,
    )
  );
}

const PRIMERO = (() => {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 5,
    dia: 1,
    hora: 9,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
})();

/** El día `numero`, contando el 1 de mayo como el día 1. */
function dia(numero: number): FechaHora {
  return sumarDias(PRIMERO, numero - 1);
}

const ACTOR = {
  tipo: "persona",
  usuarioId: identificadorDesde<"Usuario">("usuario-inventado"),
} as const;

function marca(numero: number, nota: string | null = null) {
  return { en: dia(numero), actor: ACTOR, origen: nota };
}

type Accion =
  | {
      readonly tipo: "manual";
      readonly a: EstadoServicio;
      readonly motivo: string | null;
    }
  | { readonly tipo: "causa"; readonly causa: Causa };

/** El historial después de la acción, o `null` si el dominio la rechazó o no aplica. */
function aplicar(
  historial: HistorialServicio,
  accion: Accion,
  numero: number,
): HistorialServicio | null {
  if (accion.tipo === "causa") {
    return porCausa(historial, accion.causa, marca(numero, "Por su causa"));
  }
  const resultado = pedirCambio(
    historial,
    accion.a,
    marca(numero, accion.motivo),
  );
  return resultado.ok ? resultado.valor : null;
}

const MOTIVO = "Motivo inventado";

/** Un camino válido desde `creado` hasta cada estado. */
const CAMINO: Readonly<Record<EstadoServicio, readonly Accion[]>> = {
  creado: [],
  cotizado: [{ tipo: "causa", causa: "cotizacion" }],
  adjudicado: [
    { tipo: "causa", causa: "cotizacion" },
    { tipo: "causa", causa: "ordenDeCompra" },
  ],
  en_ejecucion: [
    { tipo: "causa", causa: "cotizacion" },
    { tipo: "causa", causa: "ordenDeCompra" },
    { tipo: "manual", a: "en_ejecucion", motivo: null },
  ],
  finalizado: [
    { tipo: "causa", causa: "cotizacion" },
    { tipo: "causa", causa: "ordenDeCompra" },
    { tipo: "manual", a: "en_ejecucion", motivo: null },
    { tipo: "manual", a: "finalizado", motivo: null },
  ],
  cerrado: [
    { tipo: "causa", causa: "cotizacion" },
    { tipo: "causa", causa: "ordenDeCompra" },
    { tipo: "manual", a: "en_ejecucion", motivo: null },
    { tipo: "manual", a: "finalizado", motivo: null },
    { tipo: "causa", causa: "cobrado" },
  ],
  perdido: [
    { tipo: "causa", causa: "cotizacion" },
    { tipo: "manual", a: "perdido", motivo: MOTIVO },
  ],
  sin_respuesta: [
    { tipo: "causa", causa: "cotizacion" },
    { tipo: "manual", a: "sin_respuesta", motivo: MOTIVO },
  ],
  cancelado: [{ tipo: "manual", a: "cancelado", motivo: MOTIVO }],
};

function historialEn(estado: EstadoServicio): HistorialServicio {
  let historial = cicloServicio.crear(ESTADO_INICIAL, marca(1));
  for (const [indice, accion] of CAMINO[estado].entries()) {
    const siguiente = aplicar(historial, accion, indice + 2);
    if (siguiente === null) {
      throw new Error(`el camino a ${estado} se cortó`);
    }
    historial = siguiente;
  }
  return historial;
}

describe("los estados de un servicio", () => {
  test("son nueve, y un servicio nace creado", () => {
    expect([...ESTADOS_SERVICIO].sort()).toEqual(Object.keys(MANUALES).sort());
    expect(ESTADO_INICIAL).toBe("creado");
  });

  test.each(ESTADOS_SERVICIO.map((estado) => [estado] as const))(
    "a %s se llega por el camino declarado",
    (estado) => {
      expect(cicloServicio.estadoActual(historialEn(estado))).toBe(estado);
    },
  );

  test.each(ESTADOS_SERVICIO.map((estado) => [estado] as const))(
    "desde %s la pantalla ofrece exactamente sus cambios manuales",
    (estado) => {
      expect(transicionesManualesDesde(estado)).toEqual(MANUALES[estado]);
    },
  );

  test("solo un servicio creado admite la baja", () => {
    expect(ESTADOS_SERVICIO.filter(admiteBaja)).toEqual(["creado"]);
  });
});

describe("pedirCambio: lo que pide la persona", () => {
  test.each(
    ESTADOS_SERVICIO.flatMap((de) =>
      ESTADOS_SERVICIO.map((a) => [de, a] as const),
    ),
  )("de %s a %s", (de, a) => {
    const historial = historialEn(de);
    const resultado = pedirCambio(historial, a, marca(40, MOTIVO));

    if (MANUALES[de].includes(a)) {
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.valor.eventos.at(-1)).toEqual({
          de,
          a,
          en: dia(40),
          actor: ACTOR,
          origen: MOTIVO,
        });
      }
    } else {
      expect(resultado).toEqual({
        ok: false,
        error: { codigo: catalogo.DOM_0011.codigo, de, a },
      });
    }
  });

  test.each(
    ESTADOS_SERVICIO.flatMap((de) =>
      MANUALES[de]
        .filter((a) => PIDEN_MOTIVO.includes(a))
        .flatMap((a) => [
          [de, a, null] as const,
          [de, a, ""] as const,
          [de, a, "   "] as const,
        ]),
    ),
  )("de %s a %s sin motivo (%j) se rechaza con DOM-0017", (de, a, motivo) => {
    expect(pedirCambio(historialEn(de), a, marca(40, motivo))).toEqual({
      ok: false,
      error: { codigo: catalogo.DOM_0017.codigo, de, a },
    });
  });

  test("los demás cambios manuales no piden motivo", () => {
    const sinMotivo = ESTADOS_SERVICIO.flatMap((de) =>
      MANUALES[de]
        .filter((a) => !PIDEN_MOTIVO.includes(a))
        .map((a) => pedirCambio(historialEn(de), a, marca(40)).ok),
    );
    expect(sinMotivo).toEqual([true, true, true]);
  });
});

describe("porCausa: lo automático", () => {
  test.each(
    ESTADOS_SERVICIO.flatMap((de) =>
      CAUSAS.map((causa) => [de, causa] as const),
    ),
  )("desde %s, la causa %s", (de, causa) => {
    const [desde, hasta] = AUTOMATICAS[causa];
    const resultado = porCausa(historialEn(de), causa, marca(40, "Por algo"));
    if (de === desde) {
      expect(resultado?.eventos.at(-1)).toEqual({
        de,
        a: hasta,
        en: dia(40),
        actor: ACTOR,
        origen: "Por algo",
      });
    } else {
      expect(resultado).toBeNull();
    }
  });
});

describe("qué se carga en cada etapa", () => {
  test.each(
    ESTADOS_SERVICIO.flatMap((estado) =>
      CARGAS.map((carga) => [carga, estado] as const),
    ),
  )("%s en %s", (carga, estado) => {
    expect(admiteCarga(estado, carga)).toBe(ETAPAS[carga].includes(estado));
  });
});

describe("el tiempo en cada etapa", () => {
  test("cada tramo va de su evento al siguiente, y el último hasta ahora", () => {
    // Eventos en los días 1, 2, 3 y 4; "ahora" es el día 10.
    expect(diasPorEtapa(historialEn("en_ejecucion"), dia(10))).toEqual([
      1, 1, 1, 6,
    ]);
  });

  test("la suma de los tramos es lo que pasó desde el alta hasta ahora", () => {
    const destinos: readonly EstadoServicio[] = [
      "cotizado",
      "adjudicado",
      "en_ejecucion",
      "finalizado",
      "cerrado",
    ];
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 40 }), { maxLength: 5 }),
        fc.integer({ min: 0, max: 40 }),
        (saltos, hastaAhora) => {
          let numero = 1;
          let historial = cicloServicio.crear(ESTADO_INICIAL, marca(numero));
          for (const [indice, salto] of saltos.entries()) {
            numero += salto;
            const siguiente = cicloServicio.agregar(
              historial,
              destinos[indice] ?? "cerrado",
              marca(numero),
            );
            if (!siguiente.ok) {
              return false;
            }
            historial = siguiente.valor;
          }
          const ahora = numero + hastaAhora;
          const tramos = diasPorEtapa(historial, dia(ahora));
          return (
            tramos.length === historial.eventos.length &&
            tramos.every((tramo) => tramo >= 0) &&
            tramos.reduce((suma, tramo) => suma + tramo, 0) === ahora - 1
          );
        },
      ),
      configuracion(),
    );
  });
});

/** Lo que tendría que pasar según las tablas de este archivo; `null`, rechazada o no aplica. */
function esperado(de: EstadoServicio, accion: Accion): EstadoServicio | null {
  if (accion.tipo === "causa") {
    const [desde, hasta] = AUTOMATICAS[accion.causa];
    return de === desde ? hasta : null;
  }
  const conMotivo = (accion.motivo ?? "").trim() !== "";
  return MANUALES[de].includes(accion.a) &&
    (conMotivo || !PIDEN_MOTIVO.includes(accion.a))
    ? accion.a
    : null;
}

const acciones = fc.array(
  fc.oneof(
    fc.record({
      tipo: fc.constant("manual" as const),
      a: fc.constantFrom(...ESTADOS_SERVICIO),
      motivo: fc.constantFrom(null, "", "  ", MOTIVO),
    }),
    fc.record({
      tipo: fc.constant("causa" as const),
      causa: fc.constantFrom(...CAUSAS),
    }),
  ),
  { maxLength: 16 },
);

describe("propiedad del recorrido (1000 corridas como mínimo)", () => {
  test("ninguna secuencia de acciones sale del recorrido, y una acción rechazada no agrega nada", () => {
    const base = configuracion<[readonly Accion[]]>();
    fc.assert(
      fc.property(acciones, (secuencia) => {
        let historial = cicloServicio.crear(ESTADO_INICIAL, marca(1));
        for (const accion of secuencia) {
          const destino = esperado(
            cicloServicio.estadoActual(historial),
            accion,
          );
          const despues = aplicar(historial, accion, 2);
          if (destino === null) {
            if (despues !== null) {
              return false;
            }
            continue;
          }
          if (
            despues === null ||
            despues.eventos.length !== historial.eventos.length + 1 ||
            cicloServicio.estadoActual(despues) !== destino
          ) {
            return false;
          }
          historial = despues;
        }
        return historial.eventos.every(({ de, a }, posicion) =>
          posicion === 0
            ? de === null && a === ESTADO_INICIAL
            : de !== null &&
              de === historial.eventos[posicion - 1]?.a &&
              declarada(de, a),
        );
      }),
      { ...base, numRuns: Math.max(1000, base.numRuns ?? 0) },
    );
  });
});
