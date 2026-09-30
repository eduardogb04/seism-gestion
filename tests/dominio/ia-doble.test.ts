import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CasoIaDoble,
  crearIaDoble,
} from "../../src/adaptadores/ia-doble/ia-doble.ts";
import { ErrorSistema } from "../../src/dominio/compartido/errores/error-sistema.ts";
import type { RespuestaIa, ValorJson } from "../../src/puertos/ia.ts";
import { configuracion } from "./_arnes/propiedad.ts";

/**
 * F0-28 (R9) · El doble del puerto de IA: responde según una tabla de casos
 * que fija el test, nunca inventa. No abre red ni base: va en el nivel
 * dominio aunque viva en `src/adaptadores/`.
 */

function respuesta(salida: ValorJson): RespuestaIa {
  return {
    salida,
    modelo: "modelo-de-prueba",
    versionPrompt: "v-prueba-1",
    costoMicroUsd: 1_500n,
    tokens: 42,
  };
}

const CASOS: readonly CasoIaDoble[] = [
  {
    perfil: "remito-ficticio",
    entrada: "Remito 0001 de Ferretería Inventada",
    respuesta: respuesta({ proveedor: "Ferretería Inventada", items: 3 }),
  },
  {
    perfil: "remito-ficticio",
    entrada: "otra entrada",
    respuesta: respuesta({ proveedor: "Otro Inventado", items: 1 }),
  },
  {
    perfil: "otro-perfil",
    entrada: "Remito 0001 de Ferretería Inventada",
    respuesta: respuesta(["mismo texto", "otro perfil"]),
  },
];

describe("ia-doble", () => {
  it("responde lo que dice la tabla para el perfil y la entrada exactos", async () => {
    const doble = crearIaDoble(CASOS);
    await expect(
      doble.responder({
        perfil: "remito-ficticio",
        entrada: "Remito 0001 de Ferretería Inventada",
      }),
    ).resolves.toEqual(CASOS[0]?.respuesta);
    await expect(
      doble.responder({
        perfil: "otro-perfil",
        entrada: "Remito 0001 de Ferretería Inventada",
      }),
    ).resolves.toEqual(CASOS[2]?.respuesta);
  });

  it("un caso no previsto es un error explícito, nunca una respuesta inventada", async () => {
    const doble = crearIaDoble(CASOS);
    const promesa = doble.responder({
      perfil: "remito-ficticio",
      entrada: "texto que la tabla no tiene",
    });
    await expect(promesa).rejects.toBeInstanceOf(ErrorSistema);
    await expect(promesa).rejects.toMatchObject({
      codigo: "INF-0001",
      detalles: { perfil: "remito-ficticio" },
    });
  });

  it("rechaza al construirse una tabla con dos casos para la misma pregunta", () => {
    const repetido = CASOS[0] as CasoIaDoble;
    expect(() => crearIaDoble([...CASOS, repetido])).toThrow(ErrorSistema);
  });

  it("cuenta cada llamada, también las que no estaban en la tabla", async () => {
    const doble = crearIaDoble(CASOS);
    expect(doble.llamadas()).toBe(0);
    await doble
      .responder({ perfil: "otro-perfil", entrada: "otra entrada" })
      .catch(() => undefined);
    await doble.responder({
      perfil: "remito-ficticio",
      entrada: "otra entrada",
    });
    expect(doble.llamadas()).toBe(2);
  });

  it("lo que devuelve es una copia: tocarla no cambia la próxima respuesta", async () => {
    const doble = crearIaDoble(CASOS);
    const pregunta = { perfil: "remito-ficticio", entrada: "otra entrada" };
    const primera = await doble.responder(pregunta);
    (primera.salida as { items: number }).items = 99;
    await expect(doble.responder(pregunta)).resolves.toEqual(
      CASOS[1]?.respuesta,
    );
  });

  it("propiedad: determinista, la misma pregunta da siempre la misma respuesta", async () => {
    const valorJson = fc.jsonValue() as fc.Arbitrary<ValorJson>;
    const tablas = fc.uniqueArray(
      fc.record({
        perfil: fc.string(),
        entrada: fc.string(),
        salida: valorJson,
        costo: fc.bigInt({ min: 0n, max: 10n ** 9n }),
        tokens: fc.nat(),
      }),
      {
        minLength: 1,
        maxLength: 8,
        selector: (caso) => `${caso.perfil}\u0000${caso.entrada}`,
      },
    );
    await fc.assert(
      fc.asyncProperty(tablas, fc.nat(), async (filas, indice) => {
        const casos: CasoIaDoble[] = filas.map((fila) => ({
          perfil: fila.perfil,
          entrada: fila.entrada,
          respuesta: {
            salida: fila.salida,
            modelo: "modelo-de-prueba",
            versionPrompt: "v-prueba-1",
            costoMicroUsd: fila.costo,
            tokens: fila.tokens,
          },
        }));
        const elegido = casos[indice % casos.length] as CasoIaDoble;
        const pregunta = { perfil: elegido.perfil, entrada: elegido.entrada };
        const doble = crearIaDoble(casos);
        const primera = await doble.responder(pregunta);
        const segunda = await doble.responder(pregunta);
        const deOtroDoble = await crearIaDoble(casos).responder(pregunta);
        expect(primera).toEqual(elegido.respuesta);
        expect(segunda).toEqual(primera);
        expect(deOtroDoble).toEqual(primera);
      }),
      configuracion(),
    );
  });
});
