/**
 * F0-22: `Actor` — quién hizo algo. Nunca anónimo: todo caso de uso que
 * escribe recibe un `Actor` (persona o proceso del sistema), nunca un
 * tercer valor sin dueño. `NombreProceso` es un texto marcado, no vacío y
 * en kebab-case, que solo se arma con `crearNombreProceso`.
 */
import { describe, expect, it } from "vitest";
import {
  type Actor,
  crearNombreProceso,
  type NombreProceso,
} from "../../src/dominio/compartido/actor.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";

describe("Actor", () => {
  it("un actor persona lleva el identificador del usuario", () => {
    const actor: Actor = {
      tipo: "persona",
      usuarioId: identificadorDesde("11111111-1111-4111-8111-111111111111"),
    };
    expect(actor.tipo).toBe("persona");
  });

  it("un actor sistema lleva el nombre del proceso", () => {
    const resultado = crearNombreProceso("recordatorio-vencimientos");
    if (!resultado.ok) {
      throw new Error(
        `el nombre de proceso del test es inválido: ${resultado.error}`,
      );
    }
    const nombre: NombreProceso = resultado.valor;
    const actor: Actor = { tipo: "sistema", proceso: nombre };
    expect(actor.tipo).toBe("sistema");
  });

  it("un actor anónimo no compila: no existe un tercer tipo sin dueño", () => {
    // @ts-expect-error un actor sin `tipo: 'persona' | 'sistema'` no es un Actor.
    const actorAnonimo: Actor = { tipo: "anonimo" };
    expect(actorAnonimo).toBeDefined();
  });

  it("un actor sin la propiedad `tipo` no compila", () => {
    // @ts-expect-error un Actor siempre necesita `tipo`.
    const actorSinTipo: Actor = { usuarioId: identificadorDesde("x") };
    expect(actorSinTipo).toBeDefined();
  });

  it("un nombre de proceso vacío se rechaza", () => {
    const resultado = crearNombreProceso("");
    expect(resultado.ok).toBe(false);
  });

  it("un nombre de proceso que no está en kebab-case se rechaza", () => {
    const resultado = crearNombreProceso("Recordatorio_Vencimientos");
    expect(resultado.ok).toBe(false);
  });

  it("un nombre de proceso válido en kebab-case se acepta", () => {
    const resultado = crearNombreProceso("recordatorio-vencimientos");
    expect(resultado.ok).toBe(true);
  });

  it("un nombre de proceso no puede empezar con un número ni un guion", () => {
    expect(crearNombreProceso("1-proceso").ok).toBe(false);
    expect(crearNombreProceso("-proceso").ok).toBe(false);
  });

  it("un nombre de proceso con un carácter inválido al final se rechaza, no solo se recorta", () => {
    const resultado = crearNombreProceso("proceso-valido!");
    expect(resultado.ok).toBe(false);
  });
});
