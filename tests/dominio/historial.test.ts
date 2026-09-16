import { describe, expect, it } from "vitest";
import {
  CODIGO_TRANSICION_INVALIDA,
  definirCiclo,
  type Historial,
  type Transiciones,
} from "../../src/dominio/compartido/historial.ts";

/**
 * F0-21 · El estado no es un campo, es un historial de eventos.
 *
 * El ciclo de estados de este archivo es **ficticio** y genérico: prueba el
 * mecanismo, no describe ninguna entidad de SeisM (Fase 1 define las suyas).
 *
 * La marca de tiempo entra como parámetro (`en`) y la aritmética de fechas se
 * inyecta (`diferenciaEnDias`): el dominio nunca llama a la fecha del sistema.
 * Acá, en el nivel test, se usa `Date` para armar esa función; dentro de
 * `src/dominio/` está prohibido (F0-18).
 */

type Estado = "borrador" | "enviado" | "aceptado" | "rechazado" | "anulado";

const TRANSICIONES: Transiciones<Estado> = {
  borrador: ["enviado", "anulado"],
  enviado: ["aceptado", "rechazado", "anulado"],
  rechazado: ["borrador", "anulado"],
  aceptado: [],
  anulado: [],
};

const ESTADOS: readonly Estado[] = [
  "borrador",
  "enviado",
  "aceptado",
  "rechazado",
  "anulado",
];

const MILISEGUNDOS_POR_DIA = 86_400_000;

/** Días enteros entre dos fechas ISO (`AAAA-MM-DD`), como los dará F0-18. */
function diferenciaEnDias(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(hasta) - Date.parse(desde)) / MILISEGUNDOS_POR_DIA,
  );
}

const ciclo = definirCiclo<Estado>({
  transiciones: TRANSICIONES,
  diferenciaEnDias,
});

function marcaEn(en: string) {
  return { en, actor: "usuario-ficticio", origen: "manual" };
}

const MARCA = marcaEn("2026-01-01");

/** Aplica una secuencia de estados sobre un historial nuevo en `borrador`. */
function aplicar(secuencia: readonly Estado[]) {
  let historial = ciclo.crear("borrador", MARCA);
  for (const [indice, estado] of secuencia.entries()) {
    const dia = String(indice + 2).padStart(2, "0");
    const resultado = ciclo.agregar(
      historial,
      estado,
      marcaEn(`2026-01-${dia}`),
    );
    if (!resultado.ok) {
      return resultado;
    }
    historial = resultado.valor;
  }
  return { ok: true, valor: historial } as const;
}

/** Todas las secuencias de transiciones declaradas de hasta `largo` pasos. */
function caminosValidos(desde: Estado, largo: number): Estado[][] {
  if (largo === 0) {
    return [[]];
  }
  const caminos: Estado[][] = [[]];
  for (const siguiente of TRANSICIONES[desde]) {
    for (const cola of caminosValidos(siguiente, largo - 1)) {
      caminos.push([siguiente, ...cola]);
    }
  }
  return caminos;
}

describe("historial de estados", () => {
  it("nace con un solo evento, sin estado anterior", () => {
    const historial = ciclo.crear("borrador", MARCA);

    expect(historial.eventos).toHaveLength(1);
    expect(historial.eventos[0]).toEqual({
      de: null,
      a: "borrador",
      en: "2026-01-01",
      actor: "usuario-ficticio",
      origen: "manual",
    });
  });

  it("agregar devuelve un historial nuevo y deja intacto el anterior", () => {
    const antes = ciclo.crear("borrador", MARCA);
    const resultado = ciclo.agregar(antes, "enviado", marcaEn("2026-01-02"));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) {
      return;
    }
    expect(resultado.valor).not.toBe(antes);
    expect(antes.eventos).toHaveLength(1);
    expect(resultado.valor.eventos).toHaveLength(2);
    expect(resultado.valor.eventos[1]?.de).toBe("borrador");
  });

  it("el historial, su lista de eventos y cada evento quedan congelados", () => {
    const historial = ciclo.crear("borrador", MARCA);

    expect(Object.isFrozen(historial)).toBe(true);
    expect(Object.isFrozen(historial.eventos)).toBe(true);
    expect(Object.isFrozen(historial.eventos[0])).toBe(true);
  });

  it("no expone ninguna operación que modifique o borre un evento pasado", () => {
    expect(Object.keys(ciclo).sort()).toEqual([
      "agregar",
      "crear",
      "diasEntre",
      "estadoActual",
      "fechaDe",
    ]);
  });

  it("un historial sin eventos no existe: leerlo o seguirlo corta", () => {
    const vacio: Historial<Estado> = { eventos: [] };

    expect(() => ciclo.estadoActual(vacio)).toThrow(/se arma con crear/);
    expect(() => ciclo.agregar(vacio, "enviado", MARCA)).toThrow(
      /se arma con crear/,
    );
  });

  it("rechaza una transición no declarada con el error del dominio", () => {
    const historial = ciclo.crear("borrador", MARCA);
    const resultado = ciclo.agregar(
      historial,
      "aceptado",
      marcaEn("2026-01-02"),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) {
      return;
    }
    expect(resultado.error).toEqual({
      codigo: CODIGO_TRANSICION_INVALIDA,
      de: "borrador",
      a: "aceptado",
      permitidas: ["enviado", "anulado"],
      posicion: 1,
    });
  });

  it("rechaza salir de un estado terminal", () => {
    const resultado = aplicar(["enviado", "aceptado", "borrador"]);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) {
      return;
    }
    expect(resultado.error.de).toBe("aceptado");
    expect(resultado.error.permitidas).toEqual([]);
    expect(resultado.error.posicion).toBe(3);
  });

  describe("propiedades sobre todas las secuencias de hasta ocho pasos", () => {
    const secuencias = caminosValidos("borrador", 8);

    it("acepta toda secuencia armada solo con transiciones declaradas", () => {
      expect(secuencias.length).toBeGreaterThan(10);
      for (const secuencia of secuencias) {
        const resultado = aplicar(secuencia);
        expect(resultado.ok, `debió aceptar ${JSON.stringify(secuencia)}`).toBe(
          true,
        );
        if (resultado.ok) {
          expect(resultado.valor.eventos).toHaveLength(secuencia.length + 1);
        }
      }
    });

    it("rechaza en su posición cualquier secuencia con una transición no declarada", () => {
      for (const prefijo of secuencias) {
        const ultimo: Estado = prefijo.at(-1) ?? "borrador";
        const invalidos = ESTADOS.filter(
          (estado) => !TRANSICIONES[ultimo].includes(estado),
        );
        for (const invalido of invalidos) {
          const resultado = aplicar([...prefijo, invalido]);
          const caso = JSON.stringify([...prefijo, invalido]);
          expect(resultado.ok, `debió rechazar ${caso}`).toBe(false);
          if (!resultado.ok) {
            expect(resultado.error.de).toBe(ultimo);
            expect(resultado.error.a).toBe(invalido);
            expect(resultado.error.posicion).toBe(prefijo.length + 1);
          }
        }
      }
    });
  });

  describe("lectura de los eventos", () => {
    it("estadoActual es el destino del último evento", () => {
      const resultado = aplicar(["enviado", "rechazado"]);

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) {
        return;
      }
      expect(ciclo.estadoActual(resultado.valor)).toBe("rechazado");
    });

    it("fechaDe devuelve la primera entrada al estado, y null si nunca pasó", () => {
      const historial = armar([
        ["enviado", "2026-04-09"],
        ["rechazado", "2026-05-02"],
        ["borrador", "2026-06-03"],
      ]);

      expect(ciclo.fechaDe(historial, "borrador")).toBe("2026-03-12");
      expect(ciclo.fechaDe(historial, "enviado")).toBe("2026-04-09");
      expect(ciclo.fechaDe(historial, "aceptado")).toBeNull();
    });

    it("diasEntre cuenta los días del caso de referencia: 28 y 56", () => {
      const historial = armar([
        ["enviado", "2026-04-09"],
        ["rechazado", "2026-06-03"],
        ["anulado", "2026-07-29"],
      ]);

      expect(ciclo.diasEntre(historial, "borrador", "enviado")).toBe(28);
      expect(ciclo.diasEntre(historial, "rechazado", "anulado")).toBe(56);
      expect(ciclo.diasEntre(historial, "borrador", "aceptado")).toBeNull();
    });

    it("diasEntre es antisimétrico", () => {
      const historial = armar([["enviado", "2026-03-13"]]);

      expect(ciclo.diasEntre(historial, "borrador", "enviado")).toBe(1);
      expect(ciclo.diasEntre(historial, "enviado", "borrador")).toBe(-1);
    });
  });

  describe("tipos", () => {
    it("los eventos son de solo lectura, en tipos y en ejecución", () => {
      const historial: Historial<Estado> = ciclo.crear("borrador", MARCA);
      const primero = historial.eventos[0];

      expect(() => {
        // @ts-expect-error `eventos` es readonly: no se reasigna.
        historial.eventos = [];
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error la lista de eventos es readonly: no se le agrega nada.
        historial.eventos.push(primero);
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error un evento pasado no se modifica.
        primero.a = "enviado";
      }).toThrow(TypeError);

      expect(historial.eventos).toHaveLength(1);
      expect(historial.eventos[0]?.a).toBe("borrador");
    });

    it("el historial no sabe qué entidad lo usa: sirve para cualquier alfabeto de estados", () => {
      const otro = definirCiclo<"activo" | "cerrado">({
        transiciones: { activo: ["cerrado"], cerrado: [] },
        diferenciaEnDias,
      });
      const resultado = otro.agregar(
        otro.crear("activo", MARCA),
        "cerrado",
        marcaEn("2026-01-02"),
      );

      expect(resultado.ok).toBe(true);
    });
  });
});

/** Historial que arranca en `borrador` el 12/03 y sigue los pasos dados. */
function armar(
  pasos: readonly (readonly [Estado, string])[],
): Historial<Estado> {
  let historial = ciclo.crear("borrador", marcaEn("2026-03-12"));
  for (const [estado, en] of pasos) {
    const resultado = ciclo.agregar(historial, estado, marcaEn(en));
    if (!resultado.ok) {
      throw new Error(`el armado del historial de prueba falló en ${estado}`);
    }
    historial = resultado.valor;
  }
  return historial;
}
