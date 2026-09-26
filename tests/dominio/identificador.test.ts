import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearSecuenciasEnMemoria } from "../../src/adaptadores/memoria/secuencias.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  type DatosCodigoLegible,
  formatearCodigo,
  generarCodigoLegible,
  type Identificador,
  identificadorDesde,
  parsearCodigo,
} from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/**
 * F0-19: identificador doble (DISENO sección 2, decisión 6). Dos bloques:
 * `Identificador<Marca>` (marca de tipo, un `@ts-expect-error` de verdad) y
 * `CodigoLegible` (formatear/parsear, con propiedades). Las propiedades de
 * ida y vuelta y de rechazo usan fast-check (F0-15,
 * `docs/adr/0015-property-based.md`) a través del helper `propiedad()`:
 * mismas propiedades y mismos casos borde que la versión anterior con
 * generador propio (`mulberry32`), solo cambia el motor.
 */

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Un prefijo de 3 letras mayúsculas cualquiera. */
const prefijoArbitrario: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...LETRAS.split("")), { minLength: 3, maxLength: 3 })
  .map((letras) => letras.join(""));

const datosCodigoLegibleArbitrarios: fc.Arbitrary<DatosCodigoLegible> =
  fc.record({
    prefijo: prefijoArbitrario,
    anio: fc.integer({ min: 1000, max: 9999 }),
    secuencia: fc.integer({ min: 1, max: 50_000 }),
  });

/** Texto "de basura": caracteres imprimibles al azar, largo variable (incluido vacío). */
const textoDeBasuraArbitrario: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z0-9\-_ .,:;/\\]{0,20}$/,
);

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
      expect(resultado.codigo).toBe(catalogo.DOM_0006.codigo);
      expect(resultado.mensaje).toContain("prefijo");
    }
  });

  it.each([999, 10_000, 0, -2026, 2026.5])("rechaza el año %j", (anio) => {
    const resultado = formatearCodigo({ prefijo: "SRV", anio, secuencia: 1 });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.codigo).toBe(catalogo.DOM_0006.codigo);
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
      expect(resultado.codigo).toBe(catalogo.DOM_0006.codigo);
      expect(resultado.mensaje).toContain("secuencia");
    }
  });
});

describe("generarCodigoLegible: el año sale del reloj inyectado", () => {
  function fechaHoraDe(anio: number, mes: number, dia: number) {
    const resultado = crearFechaHora({
      anio,
      mes,
      dia,
      hora: 0,
      minuto: 0,
      segundo: 0,
      milisegundo: 0,
    });
    if (!resultado.ok) {
      throw new Error(resultado.mensaje);
    }
    return resultado.fechaHora;
  }

  it("toma el año de reloj.ahora(), no de un parámetro numérico", () => {
    const reloj = RelojFijo(fechaHoraDe(2026, 9, 15));

    const resultado = generarCodigoLegible(reloj, {
      prefijo: "SRV",
      secuencia: 14,
    });

    expect(resultado).toEqual({ ok: true, codigo: "SRV-2026-014" });
  });

  it("un reloj con otro año arma un código de ese otro año (cambio de año)", () => {
    const reloj = RelojFijo(fechaHoraDe(2027, 1, 1));

    const resultado = generarCodigoLegible(reloj, {
      prefijo: "SRV",
      secuencia: 1,
    });

    expect(resultado).toEqual({ ok: true, codigo: "SRV-2027-001" });
  });

  it("delega en formatearCodigo para el resto de las reglas (prefijo inválido, acá con el año del reloj)", () => {
    const reloj = RelojFijo(fechaHoraDe(2026, 12, 31));

    const resultado = generarCodigoLegible(reloj, {
      prefijo: "srv",
      secuencia: 1,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.codigo).toBe(catalogo.DOM_0006.codigo);
      expect(resultado.mensaje).toContain("prefijo");
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
    "SRV-0999-014",
    "SRV-0000-014",
  ])("rechaza %j", (basura) => {
    expect(parsearCodigo(basura)).toBeNull();
  });
});

/** Igual que `datosCodigoLegibleArbitrarios`, pero con secuencia ≤ 999: código de largo fijo (12). */
const datosCodigoLegibleCortosArbitrarios: fc.Arbitrary<DatosCodigoLegible> =
  fc.record({
    prefijo: prefijoArbitrario,
    anio: fc.integer({ min: 1000, max: 9999 }),
    secuencia: fc.integer({ min: 1, max: 999 }),
  });

const ALFABETO_MUTACION =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

describe("formatearCodigo / parsearCodigo: propiedades", () => {
  it("ida y vuelta: parsearCodigo deshace lo que arma formatearCodigo", () => {
    propiedad(datosCodigoLegibleArbitrarios, (datos) => {
      const formateado = formatearCodigo(datos);

      expect(formateado.ok).toBe(true);
      if (formateado.ok) {
        expect(parsearCodigo(formateado.codigo)).toEqual(datos);
      }
    });
  });

  it("rechazo: ninguna cadena de basura pasa el parseo, salvo que caiga (por chance) en un código válido", () => {
    propiedad(textoDeBasuraArbitrario, (basura) => {
      // Un generador de basura puede, por pura chance combinatoria, producir
      // un código válido (P-A-1..20 caracteres puede caer justo en
      // "ABC-1234-567"). Se descarta esa rareza en vez de forzar el test a
      // fallar: lo que importa es que TODO lo demás sea rechazado.
      if (parsearCodigo(basura) !== null) {
        expect(formatearCodigoValido(basura)).toBe(true);
        return;
      }

      expect(parsearCodigo(basura)).toBeNull();
    });
  });

  it("rechazo: mutar un solo carácter de un código válido lo rechaza (o cae en otro código válido distinto)", () => {
    propiedad(
      datosCodigoLegibleCortosArbitrarios,
      fc.integer({ min: 0, max: 11 }),
      fc.constantFrom(...ALFABETO_MUTACION.split("")),
      (original, posicion, nuevoCaracter) => {
        const formateado = formatearCodigo(original);
        expect(formateado.ok).toBe(true);
        if (!formateado.ok) {
          return;
        }

        const mutado =
          formateado.codigo.slice(0, posicion) +
          nuevoCaracter +
          formateado.codigo.slice(posicion + 1);

        const resultado = parsearCodigo(mutado);
        if (mutado === formateado.codigo) {
          expect(resultado).toEqual(original);
          return;
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
      },
    );
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
