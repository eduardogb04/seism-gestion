/**
 * F2-04 · El ciclo de vida de un servicio, sobre el historial de F0-21.
 *
 * La tabla de abajo está escrita a mano, aparte de la del dominio: si alguien
 * agrega o quita una transición allá, acá se ve.
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  type FechaHora,
} from "../../src/dominio/compartido/reloj.ts";
import {
  admiteBaja,
  cicloServicio,
  ESTADO_INICIAL,
  ESTADOS_SERVICIO,
  type EstadoServicio,
  type HistorialServicio,
  transicionesDesde,
} from "../../src/dominio/servicios/estados.ts";
import { propiedad } from "./_arnes/propiedad.ts";

const PERMITIDAS: Readonly<Record<EstadoServicio, readonly EstadoServicio[]>> =
  {
    solicitado: ["cotizado", "perdido", "sin_respuesta", "cancelado"],
    cotizado: ["adjudicado", "perdido", "sin_respuesta", "cancelado"],
    adjudicado: ["vigente", "perdido", "sin_respuesta", "cancelado"],
    vigente: ["cerrado", "cancelado"],
    cerrado: [],
    perdido: [],
    sin_respuesta: ["cotizado"],
    cancelado: [],
  };

/** Un camino válido desde `solicitado` hasta cada estado. */
const CAMINO: Readonly<Record<EstadoServicio, readonly EstadoServicio[]>> = {
  solicitado: [],
  cotizado: ["cotizado"],
  adjudicado: ["cotizado", "adjudicado"],
  vigente: ["cotizado", "adjudicado", "vigente"],
  cerrado: ["cotizado", "adjudicado", "vigente", "cerrado"],
  perdido: ["perdido"],
  sin_respuesta: ["sin_respuesta"],
  cancelado: ["cancelado"],
};

function dia(numero: number): FechaHora {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 5,
    dia: numero,
    hora: 9,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

const ACTOR = {
  tipo: "persona",
  usuarioId: identificadorDesde<"Usuario">("usuario-inventado"),
} as const;

function marca(numero: number, nota: string | null = null) {
  return { en: dia(numero), actor: ACTOR, origen: nota };
}

function historialEn(estado: EstadoServicio): HistorialServicio {
  let historial = cicloServicio.crear(ESTADO_INICIAL, marca(1));
  for (const [indice, paso] of CAMINO[estado].entries()) {
    const resultado = cicloServicio.agregar(historial, paso, marca(indice + 2));
    if (!resultado.ok) {
      throw new Error(`el camino a ${estado} se cortó en ${paso}`);
    }
    historial = resultado.valor;
  }
  return historial;
}

describe("los estados de un servicio", () => {
  test("son ocho, y un servicio nace solicitado", () => {
    expect([...ESTADOS_SERVICIO].sort()).toEqual(
      Object.keys(PERMITIDAS).sort(),
    );
    expect(ESTADO_INICIAL).toBe("solicitado");
  });

  test.each(
    ESTADOS_SERVICIO.flatMap((de) =>
      ESTADOS_SERVICIO.map((a) => [de, a] as const),
    ),
  )("de %s a %s", (de, a) => {
    const historial = historialEn(de);
    const resultado = cicloServicio.agregar(historial, a, marca(20, "nota"));

    if (PERMITIDAS[de].includes(a)) {
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(cicloServicio.estadoActual(resultado.valor)).toBe(a);
        expect(resultado.valor.eventos.at(-1)).toEqual({
          de,
          a,
          en: dia(20),
          actor: ACTOR,
          origen: "nota",
        });
      }
    } else {
      expect(resultado).toEqual({
        ok: false,
        error: {
          codigo: catalogo.DOM_0001.codigo,
          de,
          a,
          permitidas: PERMITIDAS[de],
          posicion: historial.eventos.length,
        },
      });
    }
  });

  test.each(ESTADOS_SERVICIO.map((estado) => [estado] as const))(
    "desde %s se ofrecen exactamente sus transiciones",
    (estado) => {
      expect(transicionesDesde(estado)).toEqual(PERMITIDAS[estado]);
    },
  );

  test("solo un servicio solicitado admite la baja", () => {
    expect(ESTADOS_SERVICIO.filter(admiteBaja)).toEqual(["solicitado"]);
  });
});

describe("propiedades del ciclo", () => {
  const secuencias = fc.array(fc.constantFrom(...ESTADOS_SERVICIO), {
    maxLength: 12,
  });

  test("ninguna secuencia de intentos deja un estado fuera de la lista ni un salto que la tabla no declara", () => {
    propiedad(secuencias, (intentos) => {
      let historial = cicloServicio.crear(ESTADO_INICIAL, marca(1));
      for (const intento of intentos) {
        const resultado = cicloServicio.agregar(historial, intento, marca(2));
        if (resultado.ok) {
          historial = resultado.valor;
        }
      }
      return historial.eventos.every(
        ({ de, a }, posicion) =>
          ESTADOS_SERVICIO.includes(a) &&
          (posicion === 0
            ? de === null && a === ESTADO_INICIAL
            : de !== null &&
              de === historial.eventos[posicion - 1]?.a &&
              PERMITIDAS[de].includes(a)),
      );
    });
  });

  test("una transición inválida no deja rastro: el historial queda igual", () => {
    propiedad(
      fc.constantFrom(...ESTADOS_SERVICIO),
      fc.constantFrom(...ESTADOS_SERVICIO),
      (de, a) => {
        const historial = historialEn(de);
        const antes = [...historial.eventos];
        const resultado = cicloServicio.agregar(historial, a, marca(20));
        return (
          PERMITIDAS[de].includes(a) === resultado.ok &&
          JSON.stringify(historial.eventos) === JSON.stringify(antes)
        );
      },
    );
  });
});
