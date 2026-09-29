/**
 * El punto de armado de la app (ADR 0004; desde F0-31): el único lugar fuera
 * de `src/adaptadores` que los importa. Conecta cada puerto con su adaptador
 * y arma los casos de uso que usa `src/app`.
 *
 * Se arma **una vez por proceso**, la primera vez que un pedido lo necesita
 * (no al importar: `next build` carga los módulos sin entorno). Queda en
 * `globalThis` para que la recarga en caliente de `next dev` no abra un
 * cliente de Postgres por cada cambio, y para que la caché de sesiones sea
 * una sola.
 *
 * El entorno ya se validó al arrancar (`src/instrumentation.ts`); acá se
 * vuelve a validar para tenerlo tipado.
 */

import { crearClientePrisma } from "../../adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../adaptadores/prisma/transaccion.ts";
import { crearRelojSistema } from "../../adaptadores/reloj/sistema.ts";
import {
  type CasosUsoSesion,
  crearCasosUsoSesion,
} from "../../casos-uso/sesion/sesion.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { EstadoLogin, Identidad } from "../../puertos/identidad.ts";
import { type Entorno, validarEntorno } from "../entorno.ts";
import {
  elegirIdentidad,
  generarEstadoLogin,
  type Pruebas,
} from "./identidad.ts";

export type Armado = {
  readonly appEntorno: Entorno["APP_ENTORNO"];
  readonly identidad: Identidad;
  /** La identidad falsa (su lista de emails); `null` con Google. */
  readonly pruebas: Pruebas | null;
  readonly sesion: CasosUsoSesion;
  generarEstadoLogin(): EstadoLogin;
};

const global = globalThis as typeof globalThis & {
  armadoSeism?: Armado;
};

function armar(): Armado {
  const resultado = validarEntorno(process.env);
  if (!resultado.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "el entorno no es válido al armar la app",
    });
  }
  const { entorno } = resultado;
  const reloj = crearRelojSistema();
  const prisma = crearClientePrisma(entorno.DATABASE_URL);
  const { identidad, pruebas } = elegirIdentidad(entorno, reloj);
  return {
    appEntorno: entorno.APP_ENTORNO,
    identidad,
    pruebas,
    sesion: crearCasosUsoSesion({
      transaccional: crearTransaccionalPrisma(prisma),
      reloj,
    }),
    generarEstadoLogin,
  };
}

/** Las piezas de la app, armadas la primera vez que se piden. */
export function armado(): Armado {
  global.armadoSeism ??= armar();
  return global.armadoSeism;
}
