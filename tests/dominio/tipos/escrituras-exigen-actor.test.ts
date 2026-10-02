/**
 * F0-33: escribir exige identidad, **por tipos**. Cada caso de uso de
 * escritura y cada método de escritura de un repositorio de entidades recibe
 * un `Actor` como primer parámetro obligatorio; llamarlo sin actor **no
 * compila**.
 *
 * Lo verifica `npm run typecheck` (el `tsconfig` incluye `tests/**`): cada
 * llamada sin actor lleva un `@ts-expect-error`, y un `@ts-expect-error` que
 * no tapa ningún error es él mismo un error (`Unused '@ts-expect-error'
 * directive`). Si alguien le quita el `actor` a una firma, la llamada de acá
 * pasa a compilar y `typecheck` se pone en rojo.
 *
 * Las funciones de abajo **nunca se ejecutan**: solo existen para que el
 * compilador las mire. El `test()` del final solo evita que Vitest se queje
 * de un archivo sin tests.
 *
 * Cada llamada va en una sola línea: `@ts-expect-error` solo tapa la línea
 * que le sigue.
 *
 * No entra `RepositorioSesiones`: una sesión es una credencial, no un dato de
 * negocio (ADR 0024 y 0029).
 */

import { expect, test } from "vitest";
import type { CasosUsoAbm } from "../../../src/casos-uso/abm/abm.ts";
import type { DefinicionAbm } from "../../../src/casos-uso/abm/definicion.ts";
import type { CasosUsoPagos } from "../../../src/casos-uso/egresos/pagos.ts";
import type { CasosUsoServicios } from "../../../src/casos-uso/servicios/servicios.ts";
import type { CasosUsoUsuarios } from "../../../src/casos-uso/usuarios/usuarios.ts";
import type { Identificador } from "../../../src/dominio/compartido/identificador.ts";
import type { FechaHora } from "../../../src/dominio/compartido/reloj.ts";
import type {
  RegistroAbm,
  RepositorioAbm,
} from "../../../src/puertos/repositorios/abm.ts";
import type {
  RepositorioServicios,
  Servicio,
} from "../../../src/puertos/repositorios/servicios.ts";
import type {
  RepositorioUsuarios,
  Usuario,
} from "../../../src/puertos/repositorios/usuarios.ts";

declare const casos: CasosUsoUsuarios;
declare const repositorio: RepositorioUsuarios;
declare const usuario: Usuario;
declare const usuarioId: Identificador<"Usuario">;
declare const casosAbm: CasosUsoAbm;
declare const casosPagos: CasosUsoPagos;
declare const definicion: DefinicionAbm<"Grupo">;
declare const repositorioAbm: RepositorioAbm<"Grupo">;
declare const registroAbm: RegistroAbm<"Grupo">;
declare const casosServicios: CasosUsoServicios;
declare const repositorioServicios: RepositorioServicios;
declare const servicio: Servicio;
declare const ahora: FechaHora;
declare const evento: Parameters<RepositorioServicios["agregarEvento"]>[2];

function casosDeUsoSinActor(): void {
  // @ts-expect-error `darDeAlta` exige un `Actor` primero.
  casos.darDeAlta("alguien@ejemplo.test", "operador");
  // @ts-expect-error `revocar` exige un `Actor` primero.
  casos.revocar(usuarioId);
  // @ts-expect-error `cambiarRol` exige un `Actor` primero.
  casos.cambiarRol(usuarioId, "operador");
  // @ts-expect-error `crear` (molde de ABM, F1-03) exige un `Actor` primero.
  casosAbm.crear(definicion, {});
  // @ts-expect-error `guardar` exige un `Actor` primero.
  casosAbm.guardar(definicion, "id", {});
  // @ts-expect-error `marcarEliminado` exige un `Actor` primero.
  casosAbm.marcarEliminado(definicion, "id");
  // @ts-expect-error `registrarPago` (F2-09) exige un `Actor` primero.
  casosPagos.registrarPago("id", {});
  // @ts-expect-error `marcarPagoAnulado` exige un `Actor` primero.
  casosPagos.marcarPagoAnulado("id");
  // @ts-expect-error `crear` (servicios, F2-04) exige un `Actor` primero.
  casosServicios.crear({});
  // @ts-expect-error `guardar` de servicios exige un `Actor` primero.
  casosServicios.guardar("id", {});
  // @ts-expect-error `marcarEliminado` de servicios exige un `Actor` primero.
  casosServicios.marcarEliminado("id");
  // @ts-expect-error `cambiarEstado` exige un `Actor` primero.
  casosServicios.cambiarEstado("id", "cotizado", "");
  // @ts-expect-error `guardarSitios` exige un `Actor` primero.
  casosServicios.guardarSitios("id", []);
}

function repositoriosSinActor(): void {
  // @ts-expect-error `crear` exige un `Actor` primero.
  repositorio.crear(usuario);
  // @ts-expect-error `actualizar` exige un `Actor` primero.
  repositorio.actualizar(usuario, "actualizar");
  // @ts-expect-error `crear` del repositorio de ABM exige un `Actor` primero.
  repositorioAbm.crear(registroAbm);
  // @ts-expect-error `actualizar` del repositorio de ABM exige un `Actor` primero.
  repositorioAbm.actualizar(registroAbm, "actualizar");
  // @ts-expect-error `crear` del repositorio de servicios exige un `Actor` primero.
  repositorioServicios.crear(servicio);
  // @ts-expect-error `actualizar` del repositorio de servicios exige un `Actor` primero.
  repositorioServicios.actualizar(servicio, "actualizar");
  // @ts-expect-error `agregarEvento` exige un `Actor` primero.
  repositorioServicios.agregarEvento("id", evento);
  // @ts-expect-error `guardarSitios` del repositorio exige un `Actor` primero.
  repositorioServicios.guardarSitios("id", [], ahora);
}

test("las llamadas sin actor no compilan (lo verifica `npm run typecheck`)", () => {
  expect(casosDeUsoSinActor).toBeTypeOf("function");
  expect(repositoriosSinActor).toBeTypeOf("function");
});
