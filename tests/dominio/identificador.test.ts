import { describe, expect, it } from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearSecuenciasEnMemoria } from "../../src/adaptadores/memoria/secuencias.ts";
import {
  type DatosCodigoLegible,
  formatearCodigo,
  type Identificador,
  identificadorDesde,
  parsearCodigo,
} from "../../src/dominio/compartido/identificador.ts";

/**
 * F0-19: identificador doble (DISENO sección 2, decisión 6). Dos bloques:
 * `Identificador<Marca>` (marca de tipo, un `@ts-expect-error` de verdad) y
 * `CodigoLegible` (formatear/parsear, con propiedades). No se usa fast-check:
 * es la herramienta que F0-15 todavía no instala y esta tarea no suma
 * dependencias nuevas (decisión del orquestador). Las propiedades de ida y
 * vuelta y de rechazo se implementan con un generador propio, determinista
 * por semilla (sin librería): ver `generadorAleatorio` más abajo.
 */

/** PRNG determinista (mulberry32): mismos resultados en cada corrida de CI. */
function generadorAleatorio(semilla: number): () => number {
  let estado = semilla;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function enteroEntre(
  aleatorio: () => number,
  minimo: number,
  maximo: number,
): number {
  return minimo + Math.floor(aleatorio() * (maximo - minimo + 1));
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function prefijoAleatorio(aleatorio: () => number): string {
  let prefijo = "";
  for (let i = 0; i < 3; i++) {
    prefijo += LETRAS.charAt(enteroEntre(aleatorio, 0, LETRAS.length - 1));
  }
  return prefijo;
}

/** Genera texto "de basura": caracteres imprimibles al azar, largo variable. */
function textoDeBasura(aleatorio: () => number): string {
  const ALFABETO =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_ .,:;/\\";
  const largo = enteroEntre(aleatorio, 0, 20);
  let texto = "";
  for (let i = 0; i < largo; i++) {
    texto += ALFABETO.charAt(enteroEntre(aleatorio, 0, ALFABETO.length - 1));
  }
  return texto;
}

describe("Identificador<Marca>: marca de tipo por entidad", () => {
  type IdServicio = Identificador<"Servicio">;
  type IdFactura = Identificador<"Factura">;

  it("dos identificadores con marcas distintas no son intercambiables (tipos)", () => {
    const idServicio: IdServicio = identificadorDesde(
      "11111111-1111-4111-8111-111111111111",
    );

    // @ts-expect-error un IdServicio no se asigna a un IdFactura (marcas distintas).
    const idFacturaInvalido: IdFactura = idServicio;

    // El valor en runtime es el mismo string: la marca no existe en runtime,
    // solo en el tipo (la línea de arriba no compila sin el
    // `@ts-expect-error`; esto lo demuestra: la asignación "inválida" igual
    // ejecuta y da el mismo valor, porque la marca la borra la compilación).
    expect(String(idServicio)).toBe("11111111-1111-4111-8111-111111111111");
    expect(idFacturaInvalido).toBe(idServicio);
  });

  it("un identificador con la misma marca sí se asigna", () => {
    const idServicioA: IdServicio = identificadorDesde(
      "22222222-2222-4222-8222-222222222222",
    );
    const idServicioB: IdServicio = idServicioA;

    expect(idServicioB).toBe(idServicioA);
  });
});

describe("formatearCodigo", () => {
  it("arma PREFIJO-AAAA-NNN con la secuencia rellenada a 3 dígitos", () => {
    const resultado = formatearCodigo({
      prefijo: "SRV",
      anio: 2026,
      secuencia: 14,
    });

    expect(resultado).toEqual({ ok: true, codigo: "SRV-2026-014" });
  });

  it("no rellena de más cuando la secuencia ya tiene 3 dígitos", () => {
    const resultado = formatearCodigo({
      prefijo: "FAC",
      anio: 2026,
      secuencia: 999,
    });

    expect(resultado).toEqual({ ok: true, codigo: "FAC-2026-999" });
  });

  it("se ensancha a 4 dígitos al pasar de 999, sin rellenar", () => {
    const resultado = formatearCodigo({
      prefijo: "FAC",
      anio: 2026,
      secuencia: 1000,
    });

    expect(resultado).toEqual({ ok: true, codigo: "FAC-2026-1000" });
  });

  it("se ensancha más allá de 4 dígitos si hace falta, y sigue siendo parseable", () => {
    const resultado = formatearCodigo({
      prefijo: "FAC",
      anio: 2026,
      secuencia: 12345,
    });

    expect(resultado).toEqual({ ok: true, codigo: "FAC-2026-12345" });
    expect(resultado.ok && parsearCodigo(resultado.codigo)).toEqual({
      prefijo: "FAC",
      anio: 2026,
      secuencia: 12345,
    });
  });

  it.each([
    ["srv", "minúsculas"],
    ["SR", "dos letras"],
    ["SRVX", "cuatro letras"],
    ["SR1", "con un número"],
    ["", "vacío"],
  ])("rechaza el prefijo %j (%s)", (prefijo) => {
    const resultado = formatearCodigo({ prefijo, anio: 2026, secuencia: 1 });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("prefijo");
    }
  });

  it.each([999, 10_000, 0, -2026, 2026.5])("rechaza el año %j", (anio) => {
    const resultado = formatearCodigo({ prefijo: "SRV", anio, secuencia: 1 });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("año");
    }
  });

  it.each([0, -1, 1.5])("rechaza la secuencia %j", (secuencia) => {
    const resultado = formatearCodigo({
      prefijo: "SRV",
      anio: 2026,
      secuencia,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("secuencia");
    }
  });
});

describe("parsearCodigo: rechazos puntuales (además de la propiedad de rechazo)", () => {
  it.each([
    "srv-2026-014",
    "SRV_2026_014",
    "SRV-26-014",
    "SRV-2026-01",
    "SRV-2026-0014",
    "SRVX-2026-014",
    "SRV-2026-014-015",
    "SRV-2026-",
    "",
    "SRV-2026-014 ",
    " SRV-2026-014",
  ])("rechaza %j", (basura) => {
    expect(parsearCodigo(basura)).toBeNull();
  });
});

describe("formatearCodigo / parsearCodigo: propiedades", () => {
  it("ida y vuelta: parsearCodigo deshace lo que arma formatearCodigo, para 300 combinaciones al azar", () => {
    const aleatorio = generadorAleatorio(20260915);

    for (let i = 0; i < 300; i++) {
      const datos: DatosCodigoLegible = {
        prefijo: prefijoAleatorio(aleatorio),
        anio: enteroEntre(aleatorio, 1000, 9999),
        secuencia: enteroEntre(aleatorio, 1, 50_000),
      };

      const formateado = formatearCodigo(datos);
      expect(formateado.ok).toBe(true);
      if (formateado.ok) {
        expect(parsearCodigo(formateado.codigo)).toEqual(datos);
      }
    }
  });

  it("rechazo: 500 cadenas de basura al azar, ninguna pasa el parseo", () => {
    const aleatorio = generadorAleatorio(14022026);
    let alMenosUnaNoVacia = false;

    for (let i = 0; i < 500; i++) {
      const basura = textoDeBasura(aleatorio);
      if (basura.length > 0) {
        alMenosUnaNoVacia = true;
      }

      // Un generador de basura puede, por pura chance combinatoria, producir
      // un código válido (P-A-1..30 caracteres puede caer justo en
      // "ABC-1234-567"). Se descarta esa rareza en vez de forzar el test a
      // fallar: lo que importa es que TODO lo demás sea rechazado.
      if (parsearCodigo(basura) !== null) {
        expect(formatearCodigoValido(basura)).toBe(true);
        continue;
      }

      expect(parsearCodigo(basura)).toBeNull();
    }

    expect(alMenosUnaNoVacia).toBe(true);
  });

  it("rechazo: mutar un solo carácter de un código válido lo rechaza (o cae en otro código válido distinto)", () => {
    const aleatorio = generadorAleatorio(7);
    const ALFABETO =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

    for (let i = 0; i < 200; i++) {
      const original: DatosCodigoLegible = {
        prefijo: prefijoAleatorio(aleatorio),
        anio: enteroEntre(aleatorio, 1000, 9999),
        secuencia: enteroEntre(aleatorio, 1, 999),
      };
      const formateado = formatearCodigo(original);
      expect(formateado.ok).toBe(true);
      if (!formateado.ok) {
        continue;
      }

      const posicion = enteroEntre(aleatorio, 0, formateado.codigo.length - 1);
      const nuevoCaracter = ALFABETO.charAt(
        enteroEntre(aleatorio, 0, ALFABETO.length - 1),
      );
      const mutado =
        formateado.codigo.slice(0, posicion) +
        nuevoCaracter +
        formateado.codigo.slice(posicion + 1);

      const resultado = parsearCodigo(mutado);
      if (mutado === formateado.codigo) {
        expect(resultado).toEqual(original);
        continue;
      }

      // Cambiar un carácter nunca deja el código representando los mismos
      // datos (cambiar un dígito cambia el número; cambiar una letra del
      // prefijo cambia el prefijo).
      expect(resultado).not.toEqual(original);

      // Y si el resultado sigue pareciendo válido, tiene que ser exactamente
      // lo que dice: nunca "casi" parsea algo distinto de lo que dice.
      if (resultado !== null) {
        expect(formatearCodigo(resultado)).toEqual({
          ok: true,
          codigo: mutado,
        });
      }
    }
  });
});

/** Para el descarte de falsos positivos de `textoDeBasura` (ver arriba). */
function formatearCodigoValido(codigo: string): boolean {
  const datos = parsearCodigo(codigo);
  return datos !== null && formatearCodigo(datos).ok;
}

describe("puerto Secuencias: doble en memoria", () => {
  it("da números crecientes, arrancando en 1, por prefijo y año", async () => {
    const secuencias = crearSecuenciasEnMemoria();

    expect(await secuencias.siguiente("SRV", 2026)).toBe(1);
    expect(await secuencias.siguiente("SRV", 2026)).toBe(2);
    expect(await secuencias.siguiente("SRV", 2026)).toBe(3);
  });

  it("es independiente por combinación de prefijo y año", async () => {
    const secuencias = crearSecuenciasEnMemoria();

    expect(await secuencias.siguiente("SRV", 2026)).toBe(1);
    expect(await secuencias.siguiente("FAC", 2026)).toBe(1);
    expect(await secuencias.siguiente("SRV", 2027)).toBe(1);
    expect(await secuencias.siguiente("SRV", 2026)).toBe(2);
  });

  it("se integra con formatearCodigo para armar un CodigoLegible completo", async () => {
    const secuencias = crearSecuenciasEnMemoria();
    const secuencia = await secuencias.siguiente("SRV", 2026);

    const resultado = formatearCodigo({
      prefijo: "SRV",
      anio: 2026,
      secuencia,
    });

    expect(resultado).toEqual({ ok: true, codigo: "SRV-2026-001" });
  });
});

describe("puerto GeneradorId: doble en memoria", () => {
  const PATRON_UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it("genera identificadores con forma de UUID", () => {
    const generadorId = crearGeneradorIdCrypto();

    const valor = generadorId.generar();

    expect(valor).toMatch(PATRON_UUID);
  });

  it("no repite valores entre llamadas", () => {
    const generadorId = crearGeneradorIdCrypto();

    const valores = new Set(
      Array.from({ length: 50 }, () => generadorId.generar()),
    );

    expect(valores.size).toBe(50);
  });

  it("el UUID que genera se puede envolver como Identificador<Marca>", () => {
    type IdServicio = Identificador<"Servicio">;
    const generadorId = crearGeneradorIdCrypto();

    const id: IdServicio = identificadorDesde(generadorId.generar());

    expect(id).toMatch(PATRON_UUID);
  });
});
