/**
 * F0-33: en la app, el `Actor` de una escritura sale **solo** de la sesión
 * validada (`actorDesdeSesion()`, `src/app/(auth)/sesion-actual.ts`): no hay
 * forma de construir un `Actor` de persona desde un formulario.
 *
 * Se recorre `src/app/**` en vez de confiar en la memoria de quien agregue la
 * próxima acción (esto cierra el aviso de F0-32: el test de protección solo
 * mira `page.tsx`, y una Server Action nueva en otro archivo no quedaba
 * cubierta):
 *
 * - ningún archivo de la app, salvo `sesion-actual.ts`, arma un actor de
 *   persona a mano (`tipo: "persona"`);
 * - toda Server Action llama a `actorDesdeSesion()` o a
 *   `accesoDeAdministrador()`.
 *
 * El worker no llama hoy a ningún caso de uso de escritura; cuando lo haga,
 * su actor es `{ tipo: "sistema", proceso }` y el tipo obliga a pasarlo
 * (`escrituras-exigen-actor.test.ts`, `firmas-de-escritura.test.ts`).
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  accionesSinActor,
  archivosDeLaApp,
  construyeActorDePersona,
} from "../_arnes/actor-desde-la-sesion.ts";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const APP = path.join(RAIZ, "src/app");
const SESION_ACTUAL = path.join(APP, "(auth)", "sesion-actual.ts");

const ARCHIVOS = archivosDeLaApp(APP);

function relativo(ruta: string): string {
  return path.relative(RAIZ, ruta).split(path.sep).join("/");
}

describe("src/app: el actor sale solo de la sesión", () => {
  test("hay archivos que revisar, y hay Server Actions (un glob roto no da verde vacío)", () => {
    const conAcciones = ARCHIVOS.filter((ruta) =>
      readFileSync(ruta, "utf8").trimStart().startsWith('"use server"'),
    );

    expect(ARCHIVOS.length).toBeGreaterThan(5);
    expect(conAcciones.map(relativo)).toContain(
      "src/app/administracion/usuarios/acciones.ts",
    );
  });

  test("ningún archivo, salvo sesion-actual.ts, construye un Actor de persona", () => {
    const culpables = ARCHIVOS.filter(
      (ruta) =>
        ruta !== SESION_ACTUAL &&
        construyeActorDePersona(readFileSync(ruta, "utf8")),
    );

    expect(culpables.map(relativo)).toEqual([]);
  });

  test("toda Server Action llama a actorDesdeSesion() o accesoDeAdministrador()", () => {
    const sinActor = ARCHIVOS.flatMap((ruta) =>
      accionesSinActor(ruta, readFileSync(ruta, "utf8")).map(
        (nombre) => `${relativo(ruta)}: ${nombre}`,
      ),
    );

    expect(sinActor).toEqual([]);
  });
});

describe("los detectores (sobre código en memoria)", () => {
  test("el literal tipo: persona se detecta, con cualquier espaciado", () => {
    expect(
      construyeActorDePersona('const a = { tipo: "persona", usuarioId };'),
    ).toBe(true);
    expect(construyeActorDePersona("const a = {tipo:'persona'};")).toBe(true);
    expect(construyeActorDePersona('const a = { tipo: "sistema" };')).toBe(
      false,
    );
  });

  test("una acción que no pide el actor es rechazada", () => {
    expect(
      accionesSinActor(
        "acciones.ts",
        `"use server";
         export async function borrarTodo(formulario: FormData) {
           return armado().usuarios.revocar(formulario.get("actor"), "x");
         }`,
      ),
    ).toEqual(["borrarTodo"]);
  });

  test("una acción que llama a actorDesdeSesion() o accesoDeAdministrador() es aceptada", () => {
    expect(
      accionesSinActor(
        "acciones.ts",
        `"use server";
         export async function uno() { const actor = await actorDesdeSesion(); return actor; }
         export const dos = async () => { await accesoDeAdministrador(); };`,
      ),
    ).toEqual([]);
  });

  test("una acción que llega a la sesión por una función del mismo archivo es aceptada", () => {
    expect(
      accionesSinActor(
        "acciones.ts",
        `"use server";
         async function ejecutar(trabajo) { return trabajo(await actorDesdeSesion()); }
         export async function alta() { return ejecutar(() => 1); }`,
      ),
    ).toEqual([]);
  });

  test("una función local que no llega a la sesión no salva a la acción", () => {
    expect(
      accionesSinActor(
        "acciones.ts",
        `"use server";
         async function ejecutar(trabajo) { return trabajo({}); }
         export async function alta() { return ejecutar(() => 1); }`,
      ),
    ).toEqual(["alta"]);
  });

  test("una acción en línea (directiva dentro de la función) también se mira", () => {
    expect(
      accionesSinActor(
        "pagina.tsx",
        `export default function Pagina() {
           async function enviar(formulario: FormData) {
             "use server";
             return formulario.get("x");
           }
           return <form action={enviar} />;
         }`,
      ),
    ).toEqual(["enviar"]);
  });

  test("un archivo sin la directiva no tiene acciones, y lo que no se exporta o no es async no cuenta", () => {
    expect(
      accionesSinActor(
        "comun.ts",
        "export async function alta() { return 1; }",
      ),
    ).toEqual([]);
    expect(
      accionesSinActor(
        "acciones.ts",
        `"use server";
         async function interna() { return 1; }
         export function sincrona() { return 1; }`,
      ),
    ).toEqual([]);
  });

  describe("Server Actions exportadas por reexportación (M-07)", () => {
    const SIN_SESION = `async function borrarTodo(formulario: FormData) {
           return armado().usuarios.revocar(formulario.get("actor"), "x");
         }`;

    test("export { f } sin sesión es rechazada", () => {
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           ${SIN_SESION}
           export { borrarTodo };`,
        ),
      ).toEqual(["borrarTodo"]);
    });

    test("export { f as g } sin sesión es rechazada, con el nombre con que se exporta", () => {
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           ${SIN_SESION}
           export { borrarTodo as borrar };`,
        ),
      ).toEqual(["borrar"]);
    });

    test("export default f sin sesión es rechazada", () => {
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           ${SIN_SESION}
           export default borrarTodo;`,
        ),
      ).toEqual(["default"]);
    });

    test("export default de una función o flecha asíncrona sin sesión es rechazada", () => {
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           export default async function (formulario: FormData) { return formulario; }`,
        ),
      ).toEqual(["default"]);
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           export default async (formulario: FormData) => formulario;`,
        ),
      ).toEqual(["default"]);
    });

    test("una flecha const exportada por separado sin sesión es rechazada", () => {
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           const borrarTodo = async () => armado();
           export { borrarTodo as borrar };`,
        ),
      ).toEqual(["borrar"]);
    });

    test("las tres formas con sesión son aceptadas", () => {
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           async function uno() { return actorDesdeSesion(); }
           async function dos() { await accesoDeAdministrador(); }
           async function tres() { return actorDesdeSesion(); }
           export { uno };
           export { dos as otra };
           export default tres;`,
        ),
      ).toEqual([]);
    });

    test("lo que se reexporta pero no es una función asíncrona local no cuenta, y una exportada de dos formas se informa una vez", () => {
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           function sincrona() { return 1; }
           const VALOR = 1;
           export { sincrona, VALOR };`,
        ),
      ).toEqual([]);
      expect(
        accionesSinActor(
          "acciones.ts",
          `"use server";
           export async function alta() { return 1; }
           export { alta };`,
        ),
      ).toEqual(["alta"]);
    });

    test("un archivo temporal 'use server' con export { f } y sin sesión, dentro de la carpeta recorrida, se ve", () => {
      const carpeta = mkdtempSync(path.join(tmpdir(), "m07-"));
      try {
        writeFileSync(
          path.join(carpeta, "acciones.ts"),
          `"use server";
           async function sinSesion() { return 1; }
           export { sinSesion };`,
        );

        const sinActor = archivosDeLaApp(carpeta).flatMap((ruta) =>
          accionesSinActor(ruta, readFileSync(ruta, "utf8")),
        );

        expect(sinActor).toEqual(["sinSesion"]);
      } finally {
        rmSync(carpeta, { recursive: true, force: true });
      }
    });
  });
});
