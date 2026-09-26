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

/** El almacén de documentos en disco (F0-27): lo que trae .env.example. */
const ALMACEN_DISCO = { ALMACEN: "disco", ALMACEN_DIRECTORIO: ".almacen" };

/** Un entorno completo y válido, para variar una sola variable por test. */
const VALIDO = {
  APP_ENTORNO: "local",
  DATABASE_URL: URL_POSTGRES,
  ...ALMACEN_DISCO,
};

describe("validarEntorno: APP_ENTORNO", () => {
  it.each(["local", "ci", "servidor"])(
    "acepta APP_ENTORNO=%s y lo devuelve tipado",
    (valor) => {
      const resultado = validarEntorno({ ...VALIDO, APP_ENTORNO: valor });

      expect(resultado).toEqual({
        ok: true,
        entorno: {
          APP_ENTORNO: valor,
          DATABASE_URL: URL_POSTGRES,
          ...ALMACEN_DISCO,
        },
      });
    },
  );

  it("rechaza APP_ENTORNO ausente y el mensaje nombra la variable", () => {
    const resultado = validarEntorno({
      DATABASE_URL: URL_POSTGRES,
      ...ALMACEN_DISCO,
    });

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
      entorno: { APP_ENTORNO: "local", DATABASE_URL: valor, ...ALMACEN_DISCO },
    });
  });

  it("rechaza DATABASE_URL ausente y el mensaje nombra la variable", () => {
    const resultado = validarEntorno({
      APP_ENTORNO: "local",
      ...ALMACEN_DISCO,
    });

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
      entorno: {
        APP_ENTORNO: "local",
        DATABASE_URL: URL_POSTGRES,
        ...ALMACEN_DISCO,
      },
    });
  });
});

describe("validarEntorno: ALMACEN y sus variables (F0-27)", () => {
  const BASE = { APP_ENTORNO: "local", DATABASE_URL: URL_POSTGRES };
  const S3 = {
    ALMACEN: "s3",
    S3_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "documentos-ficticios",
    S3_ACCESS_KEY: "acceso-ficticio",
    S3_SECRET_KEY: "clave-ficticia",
  };

  /** El mensaje de un entorno que tiene que fallar. */
  function mensajeDe(variables: Record<string, string | undefined>): string {
    const resultado = validarEntorno(variables);
    expect(resultado.ok).toBe(false);
    return resultado.ok ? "" : resultado.mensaje;
  }

  it("acepta ALMACEN=disco con ALMACEN_DIRECTORIO", () => {
    expect(validarEntorno({ ...BASE, ...ALMACEN_DISCO })).toEqual({
      ok: true,
      entorno: { ...BASE, ...ALMACEN_DISCO },
    });
  });

  it("acepta ALMACEN=s3 con las cuatro S3_* y la región por defecto es auto (la de R2)", () => {
    expect(validarEntorno({ ...BASE, ...S3 })).toEqual({
      ok: true,
      entorno: { ...BASE, ...S3, S3_REGION: "auto" },
    });
  });

  it("acepta S3_REGION si viene", () => {
    expect(validarEntorno({ ...BASE, ...S3, S3_REGION: "us-east-1" })).toEqual({
      ok: true,
      entorno: { ...BASE, ...S3, S3_REGION: "us-east-1" },
    });
  });

  it.each([undefined, ""])(
    "rechaza ALMACEN=%j (ausente o vacía) y el mensaje la nombra",
    (valor) => {
      const mensaje = mensajeDe({
        ...BASE,
        ALMACEN_DIRECTORIO: ".almacen",
        ALMACEN: valor,
      });
      expect(mensaje).toContain("ALMACEN: falta");
    },
  );

  it.each(["r2", "DISCO", "memoria"])(
    "rechaza ALMACEN=%j y el mensaje dice los valores válidos",
    (valor) => {
      const mensaje = mensajeDe({ ...BASE, ...ALMACEN_DISCO, ALMACEN: valor });
      expect(mensaje).toContain("ALMACEN: tiene un valor inválido");
      expect(mensaje).toContain("disco, s3");
      expect(mensaje).not.toContain(valor);
    },
  );

  it.each([undefined, ""])(
    "con ALMACEN=disco exige ALMACEN_DIRECTORIO (%j)",
    (valor) => {
      const mensaje = mensajeDe({
        ...BASE,
        ALMACEN: "disco",
        ALMACEN_DIRECTORIO: valor,
      });
      expect(mensaje).toContain("ALMACEN_DIRECTORIO: falta");
    },
  );

  it.each(["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"])(
    "con ALMACEN=s3 no arranca sin %s y el mensaje nombra esa variable",
    (variable) => {
      const mensaje = mensajeDe({ ...BASE, ...S3, [variable]: undefined });
      expect(mensaje).toContain(`${variable}: falta`);
      for (const otra of Object.keys(S3).filter((v) => v !== variable)) {
        expect(mensaje).not.toContain(`${otra}:`);
      }
    },
  );

  it("con ALMACEN=s3 y ninguna S3_*, nombra las cuatro", () => {
    const mensaje = mensajeDe({ ...BASE, ALMACEN: "s3" });
    for (const variable of [
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_ACCESS_KEY",
      "S3_SECRET_KEY",
    ]) {
      expect(mensaje).toContain(`${variable}: falta`);
    }
  });

  it("con ALMACEN=s3 no hace falta ALMACEN_DIRECTORIO, y con disco no hacen falta las S3_*", () => {
    expect(validarEntorno({ ...BASE, ...S3 }).ok).toBe(true);
    expect(validarEntorno({ ...BASE, ...ALMACEN_DISCO }).ok).toBe(true);
  });

  it.each(["localhost:9000", "ftp://localhost:9000", "no es una url"])(
    "rechaza S3_ENDPOINT=%j (no es http/https) y dice qué se espera",
    (valor) => {
      const mensaje = mensajeDe({ ...BASE, ...S3, S3_ENDPOINT: valor });
      expect(mensaje).toContain("S3_ENDPOINT: tiene un valor inválido");
      expect(mensaje).toContain("https://");
    },
  );

  it("no repite la clave secreta ni la de acceso en el mensaje", () => {
    const mensaje = mensajeDe({
      ...BASE,
      ...S3,
      S3_ACCESS_KEY: "acceso-que-no-debe-salir",
      S3_SECRET_KEY: "secreto-que-no-debe-salir",
      S3_ENDPOINT: "no es una url",
    });
    expect(mensaje).not.toContain("que-no-debe-salir");
  });

  it("junto con otra variable rota, nombra las dos (la de la app y la del almacén)", () => {
    const mensaje = mensajeDe({ DATABASE_URL: URL_POSTGRES, ALMACEN: "s3" });
    expect(mensaje).toContain("APP_ENTORNO");
    expect(mensaje).toContain("S3_BUCKET");
  });
});
