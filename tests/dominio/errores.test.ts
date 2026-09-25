import { describe, expect, it } from "vitest";
import {
  type Codigo,
  catalogo,
  type EntradaCatalogo,
  PREFIJOS,
  TIPOS_ERROR,
} from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  ErrorSistema,
  nuevoError,
} from "../../src/dominio/compartido/errores/error-sistema.ts";
import {
  paraLog,
  paraPantalla,
} from "../../src/dominio/compartido/errores/serializar.ts";
import { leerCodigo } from "../../src/dominio/compartido/identificador.ts";
import {
  crearImporte,
  parsearImporte,
  repartir,
} from "../../src/dominio/compartido/importe.ts";

/**
 * F0-23 · Catálogo de errores con código estable.
 *
 * *"Pilar manda 'me tiró ING-0012' y Eduardo sabe qué pasó sin adivinar."*
 * Este archivo prueba la forma del catálogo, que un `ErrorSistema` solo se
 * arma desde una entrada del catálogo, y que el código que se ve en pantalla
 * es el mismo que queda en el log. Que el catálogo no cambie sin querer lo
 * cuida el golden (`tests/extraccion/catalogo-errores.test.ts`). Los detalles
 * de los errores de acá son ficticios.
 */

const entradas: readonly [string, EntradaCatalogo][] = Object.entries(catalogo);

describe("catálogo: forma de cada entrada", () => {
  it("tiene entradas", () => {
    expect(entradas.length).toBeGreaterThan(0);
  });

  it("cada clave es su código con guion bajo (DOM_0001 ↔ DOM-0001)", () => {
    for (const [clave, entrada] of entradas) {
      expect(clave).toBe(entrada.codigo.replace("-", "_"));
    }
  });

  it("cada código es PREFIJO-NNNN, con un prefijo conocido y cuatro dígitos", () => {
    for (const [, entrada] of entradas) {
      const [prefijo, numero] = entrada.codigo.split("-");
      expect(PREFIJOS).toContain(prefijo);
      expect(numero).toMatch(/^\d{4}$/);
    }
  });

  it("los prefijos son exactamente los seis del plan", () => {
    expect([...PREFIJOS].sort()).toEqual(
      ["ALM", "AUT", "DOM", "IA", "INF", "ING"].sort(),
    );
  });

  it("no hay dos entradas con el mismo código", () => {
    const codigos = entradas.map(([, entrada]) => entrada.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("el tipo es persona, sistema o externo", () => {
    expect([...TIPOS_ERROR].sort()).toEqual(["externo", "persona", "sistema"]);
    for (const [, entrada] of entradas) {
      expect(TIPOS_ERROR).toContain(entrada.tipo);
    }
  });

  it("descripción y qué hacer no están vacíos", () => {
    for (const [, entrada] of entradas) {
      expect(entrada.descripcion.trim()).not.toBe("");
      expect(entrada.queHacer.trim()).not.toBe("");
    }
  });

  it("el catálogo y sus entradas están congelados", () => {
    expect(Object.isFrozen(catalogo)).toBe(true);
    for (const [, entrada] of entradas) {
      expect(Object.isFrozen(entrada)).toBe(true);
    }
  });

  it("trae los que usan F0-24 (INF-0001) y F0-27 (ALM-0001)", () => {
    expect(catalogo.INF_0001.codigo).toBe("INF-0001");
    expect(catalogo.INF_0001.tipo).toBe("sistema");
    expect(catalogo.ALM_0001.codigo).toBe("ALM-0001");
  });

  it("el código es un tipo: sin prefijo conocido o sin cuatro dígitos no compila", () => {
    const valido: Codigo = "DOM-0001";
    // @ts-expect-error: tres dígitos no es un código del catálogo.
    const tresDigitos: Codigo = "DOM-001";
    // @ts-expect-error: XYZ no es un prefijo del catálogo.
    const prefijoDesconocido: Codigo = "XYZ-0001";
    expect([valido, tresDigitos, prefijoDesconocido]).toHaveLength(3);
  });
});

describe("ErrorSistema: solo se construye desde el catálogo", () => {
  it("nuevoError toma el código, el tipo y la descripción de la entrada", () => {
    const error = nuevoError(catalogo.DOM_0001, { de: "abierto", a: "nuevo" });

    expect(error).toBeInstanceOf(ErrorSistema);
    expect(error).toBeInstanceOf(Error);
    expect(error.codigo).toBe("DOM-0001");
    expect(error.tipo).toBe(catalogo.DOM_0001.tipo);
    expect(error.entrada).toBe(catalogo.DOM_0001);
    expect(error.detalles).toEqual({ de: "abierto", a: "nuevo" });
    expect(error.name).toBe("ErrorSistema");
    expect(error.message).toContain("DOM-0001");
  });

  it("guarda la causa si se la pasan, y no inventa una si no", () => {
    const causa = new Error("falla de prueba del borde");
    expect(nuevoError(catalogo.INF_0001, {}, causa).cause).toBe(causa);
    expect(nuevoError(catalogo.INF_0001, {}).cause).toBeUndefined();
  });

  it("sin entrada del catálogo no compila (ni con un objeto que se le parezca)", () => {
    const armarSinCatalogo = () =>
      nuevoError(
        // @ts-expect-error: el código no tiene la forma de uno del catálogo.
        { codigo: "ERROR", tipo: "sistema", descripcion: "x", queHacer: "x" },
        {},
      );
    expect(armarSinCatalogo).toBeTypeOf("function");
  });

  it("el constructor no es público: `new ErrorSistema(...)` no compila", () => {
    // @ts-expect-error: el constructor es privado; solo nuevoError construye.
    const directo = () => new ErrorSistema(catalogo.DOM_0001, {}, undefined);
    expect(directo).toBeTypeOf("function");
  });
});

describe("serialización: el código de pantalla es el del log", () => {
  const causa = nuevoError(catalogo.ALM_0001, { clave: "documento-ficticio" });
  const error = nuevoError(
    catalogo.INF_0001,
    { proceso: "worker-de-prueba", intento: 2 },
    causa,
  );

  it("paraPantalla da { codigo, tipo, mensaje } y el mensaje es la descripción", () => {
    expect(paraPantalla(error)).toEqual({
      codigo: "INF-0001",
      tipo: "sistema",
      mensaje: catalogo.INF_0001.descripcion,
    });
  });

  it("paraLog da { codigo, tipo, detalles, causa, pila }", () => {
    const log = paraLog(error);
    expect(Object.keys(log).sort()).toEqual(
      ["causa", "codigo", "detalles", "pila", "tipo"].sort(),
    );
    expect(log.codigo).toBe("INF-0001");
    expect(log.tipo).toBe("sistema");
    expect(log.detalles).toEqual({ proceso: "worker-de-prueba", intento: 2 });
    expect(log.pila).toContain("INF-0001");
  });

  it("el mismo error tiene el mismo código en pantalla y en el log", () => {
    for (const [, entrada] of entradas) {
      const cualquiera = nuevoError(entrada, { dato: "ficticio" });
      expect(paraPantalla(cualquiera).codigo).toBe(paraLog(cualquiera).codigo);
      expect(paraPantalla(cualquiera).codigo).toBe(entrada.codigo);
    }
  });

  it("paraPantalla no lleva detalles, causa ni pila", () => {
    const pantalla = JSON.stringify(paraPantalla(error));
    expect(pantalla).not.toContain("worker-de-prueba");
    expect(pantalla).not.toContain("ALM-0001");
    expect(pantalla).not.toContain("documento-ficticio");
    expect(Object.keys(paraPantalla(error)).sort()).toEqual(
      ["codigo", "mensaje", "tipo"].sort(),
    );
  });

  it("la causa se serializa recursivamente si es un ErrorSistema", () => {
    const log = paraLog(error);
    expect(log.causa).toEqual(paraLog(causa));
  });

  it("la causa es { nombre, mensaje } si es otro Error, y null si no hay", () => {
    const conError = nuevoError(
      catalogo.INF_0001,
      {},
      new TypeError("falla de prueba"),
    );
    expect(paraLog(conError).causa).toEqual({
      nombre: "TypeError",
      mensaje: "falla de prueba",
    });
    expect(paraLog(nuevoError(catalogo.INF_0001, {})).causa).toBeNull();
  });

  it("una causa que no es Error queda como texto", () => {
    const conTexto = nuevoError(catalogo.INF_0001, {}, "motivo ficticio");
    expect(paraLog(conTexto).causa).toEqual({
      nombre: "string",
      mensaje: "motivo ficticio",
    });
  });
});

describe("errores del dominio que migraron al catálogo", () => {
  it("cada modo de fallar que ya existía tiene su entrada DOM, en este orden", () => {
    expect(catalogo.DOM_0001.descripcion).toMatch(/estado/i);
    expect(catalogo.DOM_0002.descripcion).toMatch(/código/i);
    expect(catalogo.DOM_0003.descripcion).toMatch(/partes/i);
    expect(catalogo.DOM_0004.descripcion).toMatch(/tipo de cambio/i);
    expect(catalogo.DOM_0005.descripcion).toMatch(/monto/i);
  });

  it("leerCodigo da los datos de un código legible bien escrito", () => {
    expect(leerCodigo("SRV-2026-014")).toEqual({
      ok: true,
      valor: { prefijo: "SRV", anio: 2026, secuencia: 14 },
    });
  });

  it("leerCodigo rechaza un código ilegible con DOM-0002", () => {
    expect(leerCodigo("SRV-2026-0014")).toEqual({
      ok: false,
      error: { codigo: "DOM-0002", valor: "SRV-2026-0014" },
    });
  });

  it("repartir y parsearImporte fallan con los códigos del catálogo", () => {
    const repartido = repartir(crearImporte(100n, "ARS"), 0);
    expect(repartido.ok || repartido.error.codigo).toBe("DOM-0003");
    const parseado = parsearImporte("doce pesos", "ARS");
    expect(parseado.ok || parseado.error.codigo).toBe("DOM-0005");
  });
});
