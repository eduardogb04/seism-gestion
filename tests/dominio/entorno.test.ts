import { describe, expect, it } from "vitest";
import { validarEntorno } from "../../src/infraestructura/entorno.ts";

/**
 * F0-04: el esquema de entorno (Zod) que la app valida al arrancar
 * (`src/instrumentation.ts`). Nivel dominio: la validación es una función
 * pura sobre un objeto de variables, sin red, sin base y sin tocar el
 * `process.env` real. Que el servidor efectivamente no arranque se verificó
 * a mano en el PR (el e2e de humo llega en F0-14).
 */
describe("validarEntorno", () => {
  it.each(["local", "ci", "servidor"])(
    "acepta APP_ENTORNO=%s y lo devuelve tipado",
    (valor) => {
      const resultado = validarEntorno({ APP_ENTORNO: valor });

      expect(resultado).toEqual({ ok: true, entorno: { APP_ENTORNO: valor } });
    },
  );

  it("rechaza APP_ENTORNO ausente y el mensaje nombra la variable", () => {
    const resultado = validarEntorno({});

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("APP_ENTORNO");
      expect(resultado.mensaje).toContain("falta");
    }
  });

  it("rechaza APP_ENTORNO vacía como ausente (así queda si se copia mal .env.example)", () => {
    const resultado = validarEntorno({ APP_ENTORNO: "" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("APP_ENTORNO");
      expect(resultado.mensaje).toContain("falta");
    }
  });

  it.each(["produccion", "LOCAL", " local"])(
    "rechaza APP_ENTORNO=%j (fuera de local | ci | servidor) y el mensaje nombra la variable y los valores válidos",
    (valor) => {
      const resultado = validarEntorno({ APP_ENTORNO: valor });

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.mensaje).toContain("APP_ENTORNO");
        expect(resultado.mensaje).toContain("valor inválido");
        expect(resultado.mensaje).toContain("local, ci, servidor");
      }
    },
  );

  it("no repite el valor recibido en el mensaje (mañana puede ser un secreto)", () => {
    const resultado = validarEntorno({
      APP_ENTORNO: "valor-que-no-debe-salir",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).not.toContain("valor-que-no-debe-salir");
    }
  });

  it("ignora las variables que el esquema no conoce (process.env trae muchas)", () => {
    const resultado = validarEntorno({ APP_ENTORNO: "ci", PATH: "/usr/bin" });

    expect(resultado).toEqual({ ok: true, entorno: { APP_ENTORNO: "ci" } });
  });
});
