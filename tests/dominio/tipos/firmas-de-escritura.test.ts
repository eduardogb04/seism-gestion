/**
 * F0-33: verificación mecánica de que toda escritura de `src/casos-uso/**`
 * recibe un `Actor` en la primera posición (regla de `AGENTS.md`, *Cómo se
 * agrega un caso de uso que escribe*).
 *
 * "Escritura" es toda función exportada, y todo miembro de un `type` o
 * `interface` exportado, cuyo nombre empieza con `crear`, `guardar`, `dar`,
 * `revocar`, `cambiar`, `marcar` o `registrar`. En este repo los casos de uso
 * son **métodos** de un objeto que arma una fábrica (`CasosUsoUsuarios`), así
 * que mirar solo las funciones sueltas no vería ninguno de verdad: por eso se
 * miran también los miembros de los tipos.
 *
 * Es sintáctico (`ts.createSourceFile`, sin type checker): no suma tiempo al
 * nivel dominio. Complementa a `escrituras-exigen-actor.test.ts`, que prueba
 * con el compilador que llamar sin actor no compila.
 */

import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  escriturasBajo,
  type FirmaDeEscritura,
  firmasDeEscritura,
  recibeActorPrimero,
} from "../_arnes/firmas-de-escritura.ts";

const RAIZ = path.resolve(import.meta.dirname, "../../..");

/**
 * Lo que empieza con un verbo de escritura y **no** escribe. Cada una, con su
 * porqué. Una entrada que ya no coincide con nada falla el test: la lista no
 * puede quedar vieja.
 */
const NO_ESCRIBEN: Readonly<Record<string, string>> = {
  crearCasosUsoUsuarios:
    "fábrica: arma el objeto de casos de uso con sus dependencias, no escribe nada",
  crearCasosUsoSesion:
    "fábrica: arma el objeto de casos de uso de sesión con sus dependencias, no escribe nada",
  crearInterpretar:
    "fábrica (F0-28): arma `interpretar` con sus dependencias, no escribe nada",
};

function descripcion(firma: FirmaDeEscritura): string {
  return `${firma.archivo}: ${firma.nombre}(${firma.primerParametro ?? "sin parámetros"} ...)`;
}

const ESCRITURAS = escriturasBajo(RAIZ, "src/casos-uso");
const A_REVISAR = ESCRITURAS.filter((firma) => !(firma.nombre in NO_ESCRIBEN));

describe("las escrituras de src/casos-uso reciben Actor primero", () => {
  test("encuentra escrituras (un glob roto no da verde vacío)", () => {
    expect(A_REVISAR.length).toBeGreaterThan(0);
  });

  test("ve los métodos de CasosUsoUsuarios, no solo funciones sueltas", () => {
    const nombres = A_REVISAR.map((firma) => firma.nombre);

    expect(nombres).toEqual(
      expect.arrayContaining(["darDeAlta", "revocar", "cambiarRol"]),
    );
  });

  test("ninguna escritura queda sin Actor en la primera posición", () => {
    const sinActor = A_REVISAR.filter((firma) => !recibeActorPrimero(firma));

    expect(sinActor.map(descripcion)).toEqual([]);
  });

  test("cada excepción de la lista existe (no queda una vieja)", () => {
    const encontrados = new Set(ESCRITURAS.map((firma) => firma.nombre));

    expect(
      Object.keys(NO_ESCRIBEN).filter((nombre) => !encontrados.has(nombre)),
    ).toEqual([]);
  });
});

describe("el detector de firmas (sobre código en memoria)", () => {
  function sinActor(codigo: string): string[] {
    return firmasDeEscritura("en-memoria.ts", codigo)
      .filter((firma) => !recibeActorPrimero(firma))
      .map((firma) => firma.nombre);
  }

  test("una función exportada sin actor es rechazada", () => {
    expect(sinActor("export function guardarAlgo(x: string): void {}")).toEqual(
      ["guardarAlgo"],
    );
  });

  test("una función exportada con Actor primero es aceptada", () => {
    expect(
      sinActor("export function guardarAlgo(actor: Actor, x: string): void {}"),
    ).toEqual([]);
  });

  test("una función asíncrona y una flecha exportadas también se miran", () => {
    expect(
      sinActor(`
        export async function registrarUno(x: string): Promise<void> {}
        export const cambiarOtro = (x: string): void => {};
      `),
    ).toEqual(["registrarUno", "cambiarOtro"]);
  });

  test("un miembro de un type exportado sin actor es rechazado", () => {
    expect(
      sinActor(`
        export type Casos = {
          crearAlgo(x: string): Promise<void>;
          marcarAlgo: (x: string) => Promise<void>;
          darAlgo(actor: Actor, x: string): Promise<void>;
        };
      `),
    ).toEqual(["crearAlgo", "marcarAlgo"]);
  });

  test("un miembro de una interface exportada, y uno anidado, se miran", () => {
    expect(
      sinActor(`
        export interface Casos {
          revocar(x: string): void;
          grupo: { cambiarRol(x: string): void };
        }
      `),
    ).toEqual(["revocar", "cambiarRol"]);
  });

  test("un Actor que no está primero es rechazado", () => {
    expect(
      sinActor("export function guardarAlgo(x: string, actor: Actor): void {}"),
    ).toEqual(["guardarAlgo"]);
  });

  test("sin parámetros es rechazado", () => {
    expect(sinActor("export function registrarAlgo(): void {}")).toEqual([
      "registrarAlgo",
    ]);
  });

  test("lo que no empieza con un verbo de escritura, o no se exporta, no cuenta", () => {
    expect(
      sinActor(`
        export function listar(x: string): void {}
        export function creado(x: string): void {}
        export function darse(x: string): void {}
        function guardarInterno(x: string): void {}
        type Interno = { crearAlgo(x: string): void };
      `),
    ).toEqual([]);
  });

  test("el verbo tiene que terminar ahí o seguir con mayúscula", () => {
    expect(sinActor("export function dar(x: string): void {}")).toEqual([
      "dar",
    ]);
    expect(sinActor("export function darDeAlta(x: string): void {}")).toEqual([
      "darDeAlta",
    ]);
  });
});
