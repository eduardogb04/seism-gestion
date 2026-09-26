/**
 * Suite de contrato del puerto `Correo` (F0-29, R2/R7 de la ficha). Un
 * adaptador real (Gmail, WhatsApp, Telegram, SMTP: Fase 1) tiene que pasar
 * esta misma suite, con su propia forma de `preparar` — nunca `sembrar`
 * directo, que es un agregado del doble en memoria y no existe en un
 * adaptador real (ver `AGENTS.md`, *Cómo se agrega...un adaptador real de
 * un puerto con suite de contrato*).
 *
 * No usa el arnés de propiedades de `tests/dominio/_arnes/propiedad.ts`
 * (pensado para el proyecto `dominio`) a propósito: esta suite tiene que
 * poder correr también en `casos-uso` el día que un adaptador real la
 * necesite ahí, y ese proyecto no provee la semilla de fast-check por
 * `inject`. Fija su propia configuración, más chica: el volumen (hasta 250
 * mensajes) ya hace cada corrida cara.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FechaHora } from "../../src/dominio/compartido/reloj.ts";
import {
  crearFechaHora,
  esAnterior,
  sumarDias,
} from "../../src/dominio/compartido/reloj.ts";
import type { Correo, MensajeCorreo } from "../../src/puertos/correo.ts";
import { cursorInicial } from "../../src/puertos/correo.ts";

/** Lo que una fábrica de `Correo` le da a la suite: el puerto y cómo prepararlo. */
export type FabricaCorreo = () => {
  readonly puerto: Correo;
  /** Deja el buzón con exactamente estos mensajes disponibles para listar. */
  preparar(mensajes: readonly MensajeCorreo[]): Promise<void> | void;
};

const NUM_RUNS = process.env.CI ? 200 : 30;

const FECHA_BASE: FechaHora = (() => {
  const resultado = crearFechaHora({
    anio: 2026,
    mes: 1,
    dia: 1,
    hora: 0,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(
      `fecha base inválida en la suite de contrato: ${resultado.mensaje}`,
    );
  }
  return resultado.fechaHora;
})();

/** Suma `dias` días a la fecha base (aritmética del reloj, nunca `Date`). */
function fechaEn(dias: number): FechaHora {
  return sumarDias(FECHA_BASE, dias);
}

/** Un mensaje ficticio, obviamente de prueba: nada real (P14, regla 1). */
function mensajeFicticio(idExterno: string, posicion: number): MensajeCorreo {
  return {
    idExterno,
    de: "remitente-de-prueba@ejemplo-seism.test",
    para: ["destinatario-de-prueba@ejemplo-seism.test"],
    asunto: `asunto de prueba ${posicion}`,
    fecha: fechaEn(posicion),
    cuerpoTexto: `cuerpo de prueba ${posicion}`,
    adjuntos: [],
  };
}

/** Orden del contrato: por `fecha` y después por `idExterno`. */
function comparar(a: MensajeCorreo, b: MensajeCorreo): number {
  if (esAnterior(a.fecha, b.fecha)) {
    return -1;
  }
  if (esAnterior(b.fecha, a.fecha)) {
    return 1;
  }
  return a.idExterno < b.idExterno ? -1 : a.idExterno > b.idExterno ? 1 : 0;
}

/** Recorre todas las páginas desde `cursorInicial` hasta que viene vacía. */
async function listarTodo(
  puerto: Correo,
  limite: number,
): Promise<MensajeCorreo[]> {
  const recolectados: MensajeCorreo[] = [];
  let cursor = cursorInicial;
  // Cota de seguridad: si el cursor no avanza, esto falla ruidoso en vez de
  // colgarse.
  const maximoDePaginas = 300;
  for (let i = 0; i < maximoDePaginas; i++) {
    const pagina = await puerto.listarNuevos(cursor, limite);
    if (pagina.mensajes.length === 0) {
      return recolectados;
    }
    recolectados.push(...pagina.mensajes);
    cursor = pagina.cursor;
  }
  throw new Error(
    "listarTodo: no terminó en el máximo de páginas esperado; ¿el cursor no avanza?",
  );
}

/** Corre la suite de contrato de `Correo` contra la fábrica que se le pase. */
export function suiteCorreo(nombre: string, fabrica: FabricaCorreo): void {
  describe(`contrato: Correo (${nombre})`, () => {
    it("dos llamadas con el mismo cursor devuelven exactamente lo mismo, también después de marcarProcesado", async () => {
      const { puerto, preparar } = fabrica();
      const mensajes = [
        mensajeFicticio("m-1", 0),
        mensajeFicticio("m-2", 1),
        mensajeFicticio("m-3", 2),
      ];
      await preparar(mensajes);

      const primera = await puerto.listarNuevos(cursorInicial);
      const segunda = await puerto.listarNuevos(cursorInicial);
      expect(segunda).toEqual(primera);

      const marcado = await puerto.marcarProcesado("m-1");
      expect(marcado.ok).toBe(true);

      const tercera = await puerto.listarNuevos(cursorInicial);
      expect(tercera).toEqual(primera);
    });

    it("un idExterno que el adaptador nunca listó no se puede marcar procesado", async () => {
      const { puerto, preparar } = fabrica();
      await preparar([mensajeFicticio("m-1", 0)]);

      const resultado = await puerto.marcarProcesado("nunca-listado");

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.codigo).toBe("CORREO.MENSAJE_DESCONOCIDO");
        expect(resultado.error.idExterno).toBe("nunca-listado");
      }
    });

    it("marcar procesado el mismo idExterno dos veces no es error", async () => {
      const { puerto, preparar } = fabrica();
      await preparar([mensajeFicticio("m-1", 0)]);

      const primera = await puerto.marcarProcesado("m-1");
      const segunda = await puerto.marcarProcesado("m-1");

      expect(primera.ok).toBe(true);
      expect(segunda.ok).toBe(true);
    });

    it("desde el último cursor, sin mensajes nuevos, viene vacío; si después se siembra uno, aparece", async () => {
      const { puerto, preparar } = fabrica();
      await preparar([mensajeFicticio("m-1", 0), mensajeFicticio("m-2", 1)]);

      const primera = await puerto.listarNuevos(cursorInicial);
      expect(primera.mensajes.map((m) => m.idExterno)).toEqual(["m-1", "m-2"]);

      const vacia = await puerto.listarNuevos(primera.cursor);
      expect(vacia.mensajes).toEqual([]);

      const nuevo = mensajeFicticio("m-3", 2);
      await preparar([
        mensajeFicticio("m-1", 0),
        mensajeFicticio("m-2", 1),
        nuevo,
      ]);

      const conElNuevo = await puerto.listarNuevos(primera.cursor);
      expect(conElNuevo.mensajes.map((m) => m.idExterno)).toEqual(["m-3"]);
    });

    it("para cualquier conjunto sembrado, recorrer desde cursorInicial entrega cada mensaje exactamente una vez y en orden", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Pares (idExterno, posición de fecha) únicos por idExterno: la
          // posición no sigue el orden de inserción del arreglo, para que
          // el orden de llegada no coincida "por casualidad" con el orden
          // esperado (fecha, idExterno) y la propiedad ejercite el
          // ordenamiento de verdad.
          fc.uniqueArray(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.integer({ min: 0, max: 1000 }),
            ),
            { selector: (par) => par[0], maxLength: 250 },
          ),
          fc.integer({ min: 1, max: 50 }),
          async (pares, limite) => {
            const { puerto, preparar } = fabrica();
            const mensajes = pares.map(([idExterno, posicion]) =>
              mensajeFicticio(idExterno, posicion),
            );
            await preparar(mensajes);

            const recolectados = await listarTodo(puerto, limite);

            expect(recolectados).toHaveLength(mensajes.length);
            expect(new Set(recolectados.map((m) => m.idExterno)).size).toBe(
              mensajes.length,
            );

            const esperado = [...mensajes].sort(comparar);
            expect(recolectados.map((m) => m.idExterno)).toEqual(
              esperado.map((m) => m.idExterno),
            );
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });
}
