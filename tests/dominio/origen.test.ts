/**
 * F0-22: `Origen` — de dónde salió un registro: cargado a mano, llegado por
 * un mail, o propuesto por una IA (que un humano puede o no haber
 * confirmado). `estaConfirmado` dice si ese origen alcanza para que el dato
 * cuente como confirmado.
 */
import { describe, expect, it } from "vitest";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import {
  estaConfirmado,
  type Origen,
} from "../../src/dominio/compartido/origen.ts";

const unaPersona = {
  tipo: "persona" as const,
  usuarioId: identificadorDesde<"Usuario">(
    "11111111-1111-4111-8111-111111111111",
  ),
};

describe("estaConfirmado", () => {
  it("un dato cargado a mano siempre cuenta como confirmado", () => {
    const origen: Origen = { via: "manual", actor: unaPersona };
    expect(estaConfirmado(origen)).toBe(true);
  });

  it("una propuesta de IA que un humano confirmó cuenta como confirmada", () => {
    const origen: Origen = {
      via: "propuesta-ia",
      modelo: "modelo-de-prueba",
      versionPrompt: "v1",
      confirmadoPor: unaPersona,
    };
    expect(estaConfirmado(origen)).toBe(true);
  });

  it("una propuesta de IA sin confirmar no cuenta como confirmada", () => {
    const origen: Origen = {
      via: "propuesta-ia",
      modelo: "modelo-de-prueba",
      versionPrompt: "v1",
    };
    expect(estaConfirmado(origen)).toBe(false);
  });

  it("un dato llegado por ingesta de mail no cuenta como confirmado, aunque nadie lo haya rechazado", () => {
    const origen: Origen = { via: "ingesta-mail", mensajeId: "mensaje-1" };
    expect(estaConfirmado(origen)).toBe(false);
  });
});
