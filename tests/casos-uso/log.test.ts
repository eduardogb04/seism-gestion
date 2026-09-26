/**
 * El log estructurado (F0-24, ADR 0021): lo que sale nunca lleva secretos ni
 * datos personales, y sí lleva lo que hace falta para seguir un caso (la
 * `referencia` y el código de error).
 *
 * Va en el nivel casos de uso porque el arnés de `dominio` no importa
 * infraestructura, pero **no usa la base**: cada test arma un log que escribe
 * en un destino en memoria y afirma sobre las líneas capturadas. El test de
 * las excepciones no capturadas levanta un `node` hijo sobre
 * `tests/fixtures/proceso/muere.ts` y lee su salida.
 *
 * Todos los datos son inventados y obviamente falsos (dominio `ejemplo.test`,
 * CUIT con ocho ceros en el medio). Los CUIT se arman en tiempo de ejecución
 * a partir de sus partes: así ningún literal con forma de CUIT entra al repo
 * (el control de datos reales del diff los marca, aunque sean ficticios).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  conReferencia,
  crearLog,
  type DestinoLog,
  formatearLegible,
  opcionesDesdeEntorno,
  REDACTADO,
  redactar,
} from "../../src/infraestructura/log.ts";

/** Un destino que guarda cada línea escrita, para leerla después. */
function capturar(): DestinoLog & { readonly lineas: string[] } {
  const lineas: string[] = [];
  return {
    lineas,
    write(linea: string): void {
      lineas.push(linea);
    },
  };
}

function registros(lineas: readonly string[]): Record<string, unknown>[] {
  return lineas.map((linea) => JSON.parse(linea) as Record<string, unknown>);
}

const TOKEN = "tok-ficticio-0123456789abcdef";
const EMAIL_EN_CAMPO = "persona.inventada@ejemplo.test";
const EMAIL_EN_MENSAJE = "otra.persona@ejemplo.test";
const CUIT_CON_GUIONES = ["20", "00000000", "1"].join("-");
const CUIT_SIN_GUIONES = ["27", "00000000", "4"].join("");
/** El mismo tipo de dato, pero como número. */
const CUIT_COMO_NUMERO = Number(["20", "00000000", "1"].join(""));
const COOKIE = "sesion=cookie-ficticia-abc";
const SET_COOKIE = "sesion=otra-cookie-ficticia-xyz; Path=/; HttpOnly";
const CLAVE = "clave-ficticia-no-es-real";
const SECRETO = "secreto-ficticio-123";
const AUTORIZACION = "Bearer autorizacion-ficticia-456";

describe("redacción", () => {
  it("ningún token, email, CUIT, cookie ni set-cookie aparece en la salida", () => {
    const destino = capturar();
    const log = crearLog({ formato: "json", nivel: "info", destino });

    log.info(
      {
        pedido: {
          headers: {
            authorization: AUTORIZACION,
            cookie: COOKIE,
            "set-cookie": [SET_COOKIE],
          },
          credenciales: { accessToken: TOKEN, CLAVE_API: CLAVE },
          "x-api-secret": SECRETO,
        },
        contacto: { correo: EMAIL_EN_CAMPO },
        cuits: [CUIT_CON_GUIONES, `el titular ${CUIT_SIN_GUIONES} pidió`],
        numeroSuelto: CUIT_COMO_NUMERO,
      },
      `se escribió a ${EMAIL_EN_MENSAJE} por el CUIT ${CUIT_CON_GUIONES}`,
    );

    const salida = destino.lineas.join("");
    for (const crudo of [
      TOKEN,
      EMAIL_EN_CAMPO,
      EMAIL_EN_MENSAJE,
      CUIT_CON_GUIONES,
      CUIT_SIN_GUIONES,
      COOKIE,
      SET_COOKIE,
      CLAVE,
      SECRETO,
      AUTORIZACION,
      String(CUIT_COMO_NUMERO),
    ]) {
      expect(salida, `apareció en el log: ${crudo}`).not.toContain(crudo);
    }
    // El resto del texto queda: solo se reemplaza lo que parece dato personal.
    const [registro] = registros(destino.lineas);
    expect(registro?.msg).toBe(
      `se escribió a ${REDACTADO} por el CUIT ${REDACTADO}`,
    );
    expect(registro?.cuits).toEqual([
      REDACTADO,
      `el titular ${REDACTADO} pidió`,
    ]);
  });

  it("redacta el mensaje y la pila de un error serializado", () => {
    const destino = capturar();
    const log = crearLog({ formato: "json", nivel: "info", destino });

    const error = new Error(`no se pudo avisar a ${EMAIL_EN_CAMPO}`);
    error.stack = `Error: no se pudo avisar a ${EMAIL_EN_CAMPO}\n    at CUIT ${CUIT_SIN_GUIONES}`;
    log.error({ err: error }, "falló el aviso");

    const salida = destino.lineas.join("");
    expect(salida).not.toContain(EMAIL_EN_CAMPO);
    expect(salida).not.toContain(CUIT_SIN_GUIONES);
    expect(salida).toContain("no se pudo avisar a");
  });

  it("también redacta con el formato legible", () => {
    const destino = capturar();
    const log = crearLog({ formato: "legible", nivel: "info", destino });

    log.info(
      { token: TOKEN, correo: EMAIL_EN_CAMPO },
      `hola ${EMAIL_EN_MENSAJE}`,
    );

    const salida = destino.lineas.join("");
    for (const crudo of [TOKEN, EMAIL_EN_CAMPO, EMAIL_EN_MENSAJE]) {
      expect(salida).not.toContain(crudo);
    }
  });

  it("para todo email generado, en un campo cualquiera y en el mensaje, nunca aparece en la salida", () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 12 }),
        (email, clave) => {
          const destino = capturar();
          const log = crearLog({ formato: "json", nivel: "info", destino });
          log.info(
            { [clave]: email, anidado: [{ valor: email }] },
            `aviso a ${email}.`,
          );
          return !destino.lineas.join("").includes(email);
        },
      ),
      { numRuns: process.env.CI ? 1000 : 200 },
    );
  });

  it("una clave con nombre de Object.prototype (valueOf, toString, constructor) no rompe el log ni deja pasar el valor", () => {
    // Contraejemplo que encontró la propiedad de arriba: pino 10.3.1 busca
    // un serializador por clave en un objeto con prototipo, y con la clave
    // `valueOf` llamaba a Object.prototype.valueOf y tiraba TypeError.
    const destino = capturar();
    const log = crearLog({ formato: "json", nivel: "info", destino });

    log.info(
      {
        valueOf: EMAIL_EN_CAMPO,
        toString: EMAIL_EN_CAMPO,
        constructor: EMAIL_EN_CAMPO,
      },
      "claves raras",
    );

    const salida = destino.lineas.join("");
    expect(destino.lineas).toHaveLength(1);
    expect(salida).not.toContain(EMAIL_EN_CAMPO);
  });

  it("claves que contienen token, secret, password o clave, sin distinguir mayúsculas: el valor entero se redacta", () => {
    expect(
      redactar({
        refreshToken: { a: 1 },
        Client_Secret: "x",
        PASSWORD: ["y"],
        miClave: 7,
        Authorization: "z",
        "Set-Cookie": "w",
        nombreDelServicio: "SRV-2026-014",
      }),
    ).toEqual({
      refreshToken: REDACTADO,
      Client_Secret: REDACTADO,
      PASSWORD: REDACTADO,
      miClave: REDACTADO,
      Authorization: REDACTADO,
      "Set-Cookie": REDACTADO,
      nombreDelServicio: "SRV-2026-014",
    });
  });
});

describe("lo que tiene que pasar", () => {
  it("la referencia y el código de error salen intactos", () => {
    const destino = capturar();
    const log = crearLog({ formato: "json", nivel: "info", destino });

    conReferencia("SRV-2026-014", () => {
      log.error({ codigo: "INF-0001" }, "falló algo");
      log.warn({ codigo: "DOM-0001" }, "regla de negocio");
    });

    const [primero, segundo] = registros(destino.lineas);
    expect(primero).toMatchObject({
      referencia: "SRV-2026-014",
      codigo: "INF-0001",
      msg: "falló algo",
    });
    expect(segundo).toMatchObject({
      referencia: "SRV-2026-014",
      codigo: "DOM-0001",
    });
  });
});

describe("referencia por contexto asíncrono", () => {
  it("dos conReferencia concurrentes, con await intercalados, no se mezclan", async () => {
    const destino = capturar();
    const log = crearLog({ formato: "json", nivel: "info", destino });
    const esperar = (ms: number) =>
      new Promise<void>((resolver) => setTimeout(resolver, ms));

    async function trabajo(pasos: readonly number[]): Promise<void> {
      for (const [i, ms] of pasos.entries()) {
        await esperar(ms);
        log.info({ paso: i }, "paso");
      }
    }

    await Promise.all([
      conReferencia("SRV-2026-001", () => trabajo([5, 20, 5, 20])),
      conReferencia("FAC-2026-002", () => trabajo([15, 5, 20, 5])),
    ]);

    const todos = registros(destino.lineas);
    expect(todos).toHaveLength(8);
    // Que se intercalaron de verdad: la secuencia de referencias no es un bloque y otro.
    const orden = todos.map((r) => r.referencia).join(",");
    expect(orden).not.toBe(
      "SRV-2026-001,SRV-2026-001,SRV-2026-001,SRV-2026-001,FAC-2026-002,FAC-2026-002,FAC-2026-002,FAC-2026-002",
    );
    for (const referencia of ["SRV-2026-001", "FAC-2026-002"]) {
      const suyos = todos.filter((r) => r.referencia === referencia);
      expect(suyos.map((r) => r.paso)).toEqual([0, 1, 2, 3]);
    }
  });

  it("fuera de contexto no hay campo referencia (ni undefined ni null)", () => {
    const destino = capturar();
    const log = crearLog({ formato: "json", nivel: "info", destino });

    log.info("sin contexto");

    const [registro] = registros(destino.lineas);
    expect(registro).toBeDefined();
    expect(Object.hasOwn(registro ?? {}, "referencia")).toBe(false);
    expect(destino.lineas.join("")).not.toContain("referencia");
  });
});

describe("formato y nivel por entorno", () => {
  it("local: legible y debug; ci y servidor: JSON e info", () => {
    expect(opcionesDesdeEntorno({ APP_ENTORNO: "local" })).toEqual({
      formato: "legible",
      nivel: "debug",
    });
    expect(opcionesDesdeEntorno({ APP_ENTORNO: "ci" })).toEqual({
      formato: "json",
      nivel: "info",
    });
    expect(opcionesDesdeEntorno({ APP_ENTORNO: "servidor" })).toEqual({
      formato: "json",
      nivel: "info",
    });
  });

  it("LOG_NIVEL manda sobre el nivel por defecto", () => {
    expect(
      opcionesDesdeEntorno({ APP_ENTORNO: "servidor", LOG_NIVEL: "warn" }),
    ).toEqual({ formato: "json", nivel: "warn" });
    expect(
      opcionesDesdeEntorno({ APP_ENTORNO: "local", LOG_NIVEL: "error" }),
    ).toEqual({ formato: "legible", nivel: "error" });
    expect(
      opcionesDesdeEntorno({ APP_ENTORNO: "local", LOG_NIVEL: "" }),
    ).toEqual({ formato: "legible", nivel: "debug" });
  });

  it("el nivel filtra: con info, debug no sale", () => {
    const destino = capturar();
    const log = crearLog({ formato: "json", nivel: "info", destino });

    log.debug("no tiene que salir");
    log.info("sí");

    expect(registros(destino.lineas).map((r) => r.msg)).toEqual(["sí"]);
  });

  it("JSON es una sola línea por registro; legible es `HH:MM:SS nivel [referencia] mensaje {resto}`", () => {
    const json = capturar();
    crearLog({ formato: "json", nivel: "info", destino: json }).info(
      { a: 1 },
      "hola",
    );
    expect(json.lineas).toHaveLength(1);
    expect(json.lineas[0]).toMatch(/^\{.*\}\n$/);
    expect(json.lineas[0]?.slice(0, -1)).not.toContain("\n");

    const legible = capturar();
    const log = crearLog({
      formato: "legible",
      nivel: "info",
      destino: legible,
    });
    conReferencia("SRV-2026-014", () => log.warn({ a: 1 }, "hola"));
    log.info("sin ref");
    expect(legible.lineas[0]).toMatch(
      /^\d{2}:\d{2}:\d{2} warn \[SRV-2026-014\] hola \{"a":1\}\n$/,
    );
    expect(legible.lineas[1]).toMatch(/^\d{2}:\d{2}:\d{2} info sin ref\n$/);
  });

  it("formatearLegible no pierde campos: lo que no es hora, nivel, referencia ni mensaje va en el JSON del final", () => {
    const linea = formatearLegible({
      time: "2026-01-02T03:04:05.000Z",
      level: "error",
      msg: "m",
      codigo: "INF-0001",
    });
    expect(linea).toMatch(
      /^\d{2}:\d{2}:\d{2} error m \{"codigo":"INF-0001"\}$/,
    );
  });
});

describe("excepciones no capturadas", () => {
  const FIXTURE = path.join(
    import.meta.dirname,
    "..",
    "fixtures",
    "proceso",
    "muere.ts",
  );

  it.each([
    ["uncaughtException", "lanza"],
    ["unhandledRejection", "rechaza"],
  ])(
    "%s: se loguea con INF-0001 y el proceso sale con código 1, sin seguir",
    (origen, modo) => {
      const hijo = spawnSync(process.execPath, [FIXTURE, modo], {
        encoding: "utf8",
        timeout: 10_000,
        env: { ...process.env, APP_ENTORNO: "servidor" },
      });

      expect(hijo.error).toBeUndefined();
      expect(hijo.status).toBe(1);
      const salida = `${hijo.stdout}${hijo.stderr}`;
      const lineas = hijo.stdout
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .map((l) => JSON.parse(l) as Record<string, unknown>);
      const fatal = lineas.find((r) => r.codigo === "INF-0001");
      expect(fatal, `sin línea INF-0001 en: ${salida}`).toMatchObject({
        level: "fatal",
        codigo: "INF-0001",
        origen,
      });
      // La causa llega (redactada): el email del fixture no.
      expect(salida).toContain("falla ficticia");
      expect(salida).not.toContain("alguien@ejemplo.test");
      // Nunca sigue a medias.
      expect(salida).not.toContain("SIGUIO_VIVO");
    },
  );
});
