/**
 * El punto de armado de la app (ADR 0004; desde F0-31): el único lugar fuera
 * de `src/adaptadores` que los importa. Conecta cada puerto con su adaptador
 * y arma los casos de uso que usa `src/app`. Los de usuarios reciben los de
 * sesión (F0-32): al revocar o cambiar un rol, invalidan su caché. El panel
 * de salud (`salud`, F0-26) llama a `listarSalud` con sus puertos ya armados.
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

import { crearGeneradorIdCrypto } from "../../adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../adaptadores/prisma/transaccion.ts";
import { crearRelojSistema } from "../../adaptadores/reloj/sistema.ts";
import { type CasosUsoAbm, crearCasosUsoAbm } from "../../casos-uso/abm/abm.ts";
import type { Salud } from "../../casos-uso/salud/listar-salud.ts";
import {
  type CasosUsoSesion,
  crearCasosUsoSesion,
} from "../../casos-uso/sesion/sesion.ts";
import {
  type CasosUsoUsuarios,
  crearCasosUsoUsuarios,
} from "../../casos-uso/usuarios/usuarios.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { EstadoLogin, Identidad } from "../../puertos/identidad.ts";
import { type Entorno, validarEntorno } from "../entorno.ts";
import {
  elegirIdentidad,
  generarEstadoLogin,
  type Pruebas,
} from "./identidad.ts";
import { armarSalud } from "./salud.ts";

export type Armado = {
  readonly appEntorno: Entorno["APP_ENTORNO"];
  readonly identidad: Identidad;
  /** La identidad falsa (su lista de emails); `null` con Google. */
  readonly pruebas: Pruebas | null;
  readonly sesion: CasosUsoSesion;
  readonly usuarios: CasosUsoUsuarios;
  /** Los casos de uso del molde de ABM (F1-03): sirven a todos los catálogos. */
  readonly abm: CasosUsoAbm;
  /** El panel de salud (`/salud`): `listarSalud` con sus puertos armados. */
  readonly salud: () => Promise<Salud>;
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
  const transaccional = crearTransaccionalPrisma(prisma);
  const sesion = crearCasosUsoSesion({ transaccional, reloj });
  const generadorId = crearGeneradorIdCrypto();
  return {
    appEntorno: entorno.APP_ENTORNO,
    identidad,
    pruebas,
    sesion,
    usuarios: crearCasosUsoUsuarios({
      transaccional,
      reloj,
      generadorId,
      sesiones: sesion,
    }),
    abm: crearCasosUsoAbm({ transaccional, reloj, generadorId }),
    salud: armarSalud(prisma, reloj),
    generarEstadoLogin,
  };
}

/** Las piezas de la app, armadas la primera vez que se piden. */
export function armado(): Armado {
  global.armadoSeism ??= armar();
  return global.armadoSeism;
}
