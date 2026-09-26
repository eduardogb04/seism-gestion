import { describe, expect, it } from "vitest";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  claveDocumento,
  exigirMinutosValidos,
  referenciaDesde,
} from "../../src/puertos/almacen-documentos.ts";
import { CLAVES_INVALIDAS } from "../contratos/almacen-documentos.ts";

/**
 * F0-27: las claves del almacén de documentos (`src/puertos/almacen-documentos.ts`).
 * La validación es una sola y la usan los dos adaptadores; acá se prueba
 * pura, sin almacén. Que cada adaptador la aplique lo prueba la suite de
 * contrato (`tests/contratos/almacen-documentos.ts`).
 */

function relojEn(anio: number) {
  const resultado = crearFechaHora({
    anio,
    mes: 3,
    dia: 14,
    hora: 9,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return RelojFijo(resultado.fechaHora);
}

const UUID_FICTICIO = "00000000-0000-4000-8000-00000000abcd";

describe("claveDocumento", () => {
  it("arma documentos/<año del reloj>/<uuid del generador>", () => {
    const clave = claveDocumento(relojEn(2031), {
      generar: () => UUID_FICTICIO,
    });
    expect(clave).toBe(`documentos/2031/${UUID_FICTICIO}`);
  });

  it("el año sale del reloj, no de la fecha del sistema", () => {
    const generador = { generar: () => UUID_FICTICIO };
    expect(claveDocumento(relojEn(1999), generador)).toBe(
      `documentos/1999/${UUID_FICTICIO}`,
    );
  });

  it("si el generador devuelve algo que no sirve de clave, falla con ALM-0002", () => {
    expect(() =>
      claveDocumento(relojEn(2031), { generar: () => "NO-ES/../UUID" }),
    ).toThrow(expect.objectContaining({ codigo: catalogo.ALM_0002.codigo }));
  });
});

describe("referenciaDesde", () => {
  it.each([
    "documentos/2031/abc",
    "a",
    "a-b/c-d/0-9",
    `documentos/2031/${UUID_FICTICIO}`,
    "x".repeat(512),
  ])("acepta %j", (clave) => {
    expect(referenciaDesde(clave)).toBe(clave);
  });

  it("la suite de contrato trae al menos 10 claves inválidas", () => {
    expect(CLAVES_INVALIDAS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(CLAVES_INVALIDAS.map((clave) => [clave]))(
    "rechaza %j con ALM-0002",
    (clave) => {
      expect(() => referenciaDesde(clave)).toThrow(
        expect.objectContaining({ codigo: catalogo.ALM_0002.codigo }),
      );
    },
  );

  it("cubre los casos que pide la ficha: .., barras en los bordes, barra invertida, espacios, mayúsculas, acentos, no-ASCII, tramos vacíos, %, largo", () => {
    for (const obligatoria of [
      "documentos/../secreto",
      "/documentos/2031/abc",
      "documentos/2031/abc/",
      "documentos\\2031\\abc",
      "documentos/2031/a b",
      "Documentos/2031/abc",
      "documentos/2031/canción",
      "documentos/2031/名前",
      "documentos//abc",
      "documentos/2031/a%2fb",
      "",
      "x".repeat(513),
    ]) {
      expect(CLAVES_INVALIDAS).toContain(obligatoria);
    }
  });

  it("el detalle del error lleva la clave rechazada, para el log", () => {
    try {
      referenciaDesde("documentos/../x");
      expect.unreachable("tenía que fallar");
    } catch (error) {
      expect(error).toMatchObject({
        codigo: "ALM-0002",
        detalles: { clave: "documentos/../x" },
      });
    }
  });
});

describe("exigirMinutosValidos (vigencia de urlTemporal)", () => {
  it.each([1, 15, 10080])("acepta %d minutos", (minutos) => {
    expect(() => exigirMinutosValidos(minutos)).not.toThrow();
  });

  it.each([0, -1, 10081, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza %d minutos con ALM-0003",
    (minutos) => {
      expect(() => exigirMinutosValidos(minutos)).toThrow(
        expect.objectContaining({ codigo: catalogo.ALM_0003.codigo }),
      );
    },
  );
});
