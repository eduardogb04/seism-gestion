import { describe, expect, it } from "vitest";
import { validarEntorno } from "../../src/infraestructura/entorno.ts";

/**
 * F0-04 y F0-08: el esquema de entorno (Zod) que la app valida al arrancar
 * (`src/instrumentation.ts`) y que validan los scripts de base antes de tocar
 * nada (`npm run db:migrate`). Nivel dominio: la validación es una función
 * pura sobre un objeto de variables, sin red, sin base y sin tocar el
 * `process.env` real. Que el servidor y `db:migrate` efectivamente no
 * arranquen se verificó a mano en los PR (el e2e de humo llega en F0-14).
 */

/** Una URL de Postgres válida y ficticia: nada se conecta a ella en estos tests. */
const URL_POSTGRES = "postgresql://usuario:clave@localhost:5432/base";

/** Un entorno completo y válido, para variar una sola variable por test. */
const VALIDO = { APP_ENTORNO: "local", DATABASE_URL: URL_POSTGRES };

describe("validarEntorno: APP_ENTORNO", () => {
  it.each(["local", "ci", "servidor"])(
    "acepta APP_ENTORNO=%s y lo devuelve tipado",
    (valor) => {
      const resultado = validarEntorno({ ...VALIDO, APP_ENTORNO: valor });

      expect(resultado).toEqual({
        ok: true,
        entorno: { APP_ENTORNO: valor, DATABASE_URL: URL_POSTGRES },
      });
    },
  );

  it("rechaza APP_ENTORNO ausente y el mensaje nombra la variable", () => {
    const resultado = validarEntorno({ DATABASE_URL: URL_POSTGRES });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("APP_ENTORNO");
      expect(resultado.mensaje).toContain("falta");
    }
  });

  it("rechaza APP_ENTORNO vacía como ausente (así queda si se copia mal .env.example)", () => {
    const resultado = validarEntorno({ ...VALIDO, APP_ENTORNO: "" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("APP_ENTORNO");
      expect(resultado.mensaje).toContain("falta");
    }
  });

  it.each(["produccion", "LOCAL", " local"])(
    "rechaza APP_ENTORNO=%j (fuera de local | ci | servidor) y el mensaje nombra la variable y los valores válidos",
    (valor) => {
      const resultado = validarEntorno({ ...VALIDO, APP_ENTORNO: valor });

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
      ...VALIDO,
      APP_ENTORNO: "valor-que-no-debe-salir",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).not.toContain("valor-que-no-debe-salir");
    }
  });
});

describe("validarEntorno: DATABASE_URL (F0-08)", () => {
  it.each([
    "postgresql://usuario:clave@localhost:5432/base",
    "postgres://usuario:clave@localhost:5432/base",
    "postgresql://usuario:clave@db.ejemplo.test:6543/base?sslmode=require",
  ])("acepta DATABASE_URL=%s (URL de Postgres)", (valor) => {
    const resultado = validarEntorno({ ...VALIDO, DATABASE_URL: valor });

    expect(resultado).toEqual({
      ok: true,
      entorno: { APP_ENTORNO: "local", DATABASE_URL: valor },
    });
  });

  it("rechaza DATABASE_URL ausente y el mensaje nombra la variable", () => {
    const resultado = validarEntorno({ APP_ENTORNO: "local" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("DATABASE_URL");
      expect(resultado.mensaje).toContain("falta");
    }
  });

  it("rechaza DATABASE_URL vacía como ausente", () => {
    const resultado = validarEntorno({ ...VALIDO, DATABASE_URL: "" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("DATABASE_URL");
      expect(resultado.mensaje).toContain("falta");
    }
  });

  it.each([
    "mysql://usuario:clave@localhost:3306/base",
    "https://localhost:5432/base",
    "localhost:5432/base",
    "no es una url",
  ])(
    "rechaza DATABASE_URL=%j (no es una URL de Postgres) y el mensaje nombra la variable y qué se espera",
    (valor) => {
      const resultado = validarEntorno({ ...VALIDO, DATABASE_URL: valor });

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.mensaje).toContain("DATABASE_URL");
        expect(resultado.mensaje).toContain("valor inválido");
        expect(resultado.mensaje).toContain("postgresql://");
      }
    },
  );

  it("no repite la URL recibida en el mensaje (lleva la clave de la base)", () => {
    const resultado = validarEntorno({
      ...VALIDO,
      DATABASE_URL: "mysql://usuario:clave-que-no-debe-salir@localhost/base",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).not.toContain("clave-que-no-debe-salir");
    }
  });
});

describe("validarEntorno: en general", () => {
  it("nombra todas las variables que fallan, no solo la primera", () => {
    const resultado = validarEntorno({});

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensaje).toContain("APP_ENTORNO");
      expect(resultado.mensaje).toContain("DATABASE_URL");
    }
  });

  it("dice qué proceso no arranca (la app, por defecto, o el script que la llama)", () => {
    const deLaApp = validarEntorno({});
    const deUnScript = validarEntorno({}, "db:migrate");

    expect(deLaApp.ok).toBe(false);
    expect(deUnScript.ok).toBe(false);
    if (!deLaApp.ok && !deUnScript.ok) {
      expect(deLaApp.mensaje).toContain("la app no arranca");
      expect(deUnScript.mensaje).toContain("db:migrate no arranca");
    }
  });

  it("ignora las variables que el esquema no conoce (process.env trae muchas)", () => {
    const resultado = validarEntorno({ ...VALIDO, PATH: "/usr/bin" });

    expect(resultado).toEqual({
      ok: true,
      entorno: { APP_ENTORNO: "local", DATABASE_URL: URL_POSTGRES },
    });
  });
});

describe("validarEntorno: LOG_NIVEL (F0-24)", () => {
  it("es opcional: sin ella el entorno es válido y no aparece", () => {
    const resultado = validarEntorno(VALIDO);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(Object.hasOwn(resultado.entorno, "LOG_NIVEL")).toBe(false);
    }
  });

  it("vacía cuenta como no definida (así viene en .env.example)", () => {
    const resultado = validarEntorno({ ...VALIDO, LOG_NIVEL: "" });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.entorno.LOG_NIVEL).toBeUndefined();
    }
  });

  it.each(["fatal", "error", "warn", "info", "debug", "trace"])(
    "acepta LOG_NIVEL=%s",
    (valor) => {
      const resultado = validarEntorno({ ...VALIDO, LOG_NIVEL: valor });

      expect(resultado).toEqual({
        ok: true,
        entorno: { ...VALIDO, LOG_NIVEL: valor },
      });
    },
  );

  it.each(["verbose", "INFO", "5"])(
    "rechaza LOG_NIVEL=%j y el mensaje nombra la variable y los valores válidos",
    (valor) => {
      const resultado = validarEntorno({ ...VALIDO, LOG_NIVEL: valor });

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.mensaje).toContain("LOG_NIVEL");
        expect(resultado.mensaje).toContain("debug");
      }
    },
  );
});
