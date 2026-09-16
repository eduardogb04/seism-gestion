/**
 * F0-14: el criterio pide que el nivel dominio **falle** si un test intenta
 * abrir un socket, "verificado con un test que lo intenta y espera el error
 * del arnés". Es este. Si alguien sacara `sin-red.ts` de `setupFiles`, estos
 * tres tests se ponen en rojo.
 *
 * Las direcciones son del dominio reservado `.test` (RFC 2606): no existen ni
 * se resuelven. Igual nadie llega a buscarlas: el arnés corta antes.
 */

import net from "node:net";
import { describe, expect, it } from "vitest";
import { MENSAJE_SIN_RED } from "./sin-red.ts";

describe("el nivel dominio no tiene red", () => {
  it("abrir un socket TCP falla con el error del arnés", () => {
    expect(() => net.connect(5432, "base.test")).toThrow(MENSAJE_SIN_RED);
  });

  it("un socket armado a mano tampoco conecta", () => {
    const socket = new net.Socket();

    expect(() => socket.connect({ host: "base.test", port: 5432 })).toThrow(
      MENSAJE_SIN_RED,
    );
  });

  it("fetch falla con el error del arnés", async () => {
    await expect(fetch("http://servicio.test/algo")).rejects.toThrow(
      MENSAJE_SIN_RED,
    );
  });
});
