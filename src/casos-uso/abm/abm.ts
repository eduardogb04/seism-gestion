/**
 * Los casos de uso de cualquier ABM (F1-03, ADR 0031): reciben la
 * `DefinicionAbm` de la entidad, así un ABM nuevo no suma un archivo acá.
 *
 * - `crear`, `guardar` y `marcarEliminado` reciben el `Actor` primero, exigen
 *   que sea una persona activa con un rol de `rolesQueEscriben` (`AUT-0009`
 *   si no) y corren enteros en una transacción; la auditoría la deja el
 *   repositorio en esa misma transacción.
 * - Lo que la persona puede corregir en el formulario (una validación, un
 *   valor único repetido) **vuelve** por campo, no se lanza. Lo demás se lanza
 *   con su código: `DOM-0009` si el registro no existe o está dado de baja.
 * - `guardar` con los mismos datos que ya están no escribe nada: ni la fila
 *   ni una auditoría sin cambio.
 * - `listar` valida los parámetros de la URL: uno inválido cae a su valor por
 *   defecto. Buscar, ordenar y paginar los resuelve la base.
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  crearAuditable,
  marcarActualizado,
  marcarEliminado,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type {
  DatosAbm,
  EntidadAbm,
  RegistroAbm,
  RepositorioAbm,
} from "../../puertos/repositorios/abm.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import {
  type ColumnaAbm,
  camposDe,
  type DefinicionAbm,
  type Escrito,
  valorDeCampo,
} from "./definicion.ts";

const REGISTROS_POR_PAGINA = 25;

const MENSAJE_UNICO = `${catalogo.DOM_0008.codigo} · ${catalogo.DOM_0008.descripcion}`;

const esquemaId = z.uuid();

type DependenciasAbm = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

/** El mensaje que va al lado de cada campo que la persona tiene que corregir. */
export type ErroresPorCampo = Readonly<Record<string, string>>;

export type ResultadoEscritura<E extends EntidadAbm> =
  | { readonly ok: true; readonly registro: RegistroAbm<E> }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Los parámetros del listado como llegan en la URL, sin validar. */
type ParametrosListado = Readonly<Record<string, unknown>>;

export type Listado<E extends EntidadAbm> = {
  readonly registros: readonly RegistroAbm<E>[];
  /** Cuántos cumplen la búsqueda, en todas las páginas. */
  readonly total: number;
  readonly pagina: number;
  readonly paginas: number;
  readonly buscar: string;
  readonly orden: ColumnaAbm<E>;
  readonly direccion: "asc" | "desc";
};

export type CasosUsoAbm = {
  listar<E extends EntidadAbm>(
    definicion: DefinicionAbm<E>,
    parametros: ParametrosListado,
  ): Promise<Listado<E>>;
  /** El registro vigente con ese id. `DOM-0009` si no existe o está dado de baja. */
  obtener<E extends EntidadAbm>(
    definicion: DefinicionAbm<E>,
    id: string,
  ): Promise<RegistroAbm<E>>;
  crear<E extends EntidadAbm>(
    actor: Actor,
    definicion: DefinicionAbm<E>,
    escrito: Escrito,
  ): Promise<ResultadoEscritura<E>>;
  guardar<E extends EntidadAbm>(
    actor: Actor,
    definicion: DefinicionAbm<E>,
    id: string,
    escrito: Escrito,
  ): Promise<ResultadoEscritura<E>>;
  /** La baja: lógica, nunca quita la fila. */
  marcarEliminado<E extends EntidadAbm>(
    actor: Actor,
    definicion: DefinicionAbm<E>,
    id: string,
  ): Promise<void>;
};

type Validado<E extends EntidadAbm> =
  | { readonly ok: true; readonly datos: DatosAbm<E> }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

function validar<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  escrito: Escrito,
): Validado<E> {
  const leido = definicion.validacion.safeParse(
    Object.fromEntries(
      camposDe(definicion).map(([nombre, campo]) => [
        nombre,
        valorDeCampo(campo, escrito[nombre] ?? ""),
      ]),
    ),
  );
  if (leido.success) {
    return { ok: true, datos: leido.data };
  }
  const errores: Record<string, string> = {};
  for (const { path, message } of leido.error.issues) {
    errores[String(path[0])] ??= message;
  }
  return { ok: false, errores };
}

/** Los campos únicos de `datos` que ya tiene otro registro vigente (uno que no sea `propio`). */
async function repetidos<E extends EntidadAbm>(
  repositorio: RepositorioAbm<E>,
  definicion: DefinicionAbm<E>,
  datos: DatosAbm<E>,
  propio: string | null,
): Promise<ErroresPorCampo> {
  const errores: Record<string, string> = {};
  for (const campo of definicion.unicos) {
    const valor = datos[campo];
    if (typeof valor !== "string") {
      continue;
    }
    const otro = await repositorio.buscarPorValor(campo, valor);
    if (otro !== null && otro.valor.id !== propio) {
      errores[campo] = MENSAJE_UNICO;
    }
  }
  return errores;
}

function sinCambios<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  actuales: Readonly<Record<string, string | null>>,
  nuevos: Readonly<Record<string, string | null>>,
): boolean {
  return camposDe(definicion).every(
    ([campo]) => actuales[campo] === nuevos[campo],
  );
}

async function vigente<E extends EntidadAbm>(
  repos: RepositoriosEnTransaccion,
  { entidad }: DefinicionAbm<E>,
  id: string,
): Promise<RegistroAbm<E>> {
  const registro = esquemaId.safeParse(id).success
    ? await repos.abm(entidad).buscarPorId(id)
    : null;
  if (registro === null || registro.eliminadoEn !== undefined) {
    throw nuevoError(catalogo.DOM_0009, { entidad, id });
  }
  return registro;
}

function parametrosDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  parametros: ParametrosListado,
) {
  return z
    .object({
      buscar: z.string().trim().max(100).catch(""),
      orden: z.enum(definicion.orden).catch(definicion.orden[0]),
      direccion: z.enum(["asc", "desc"]).catch("asc"),
      pagina: z.coerce.number().int().min(1).catch(1),
    })
    .parse(parametros);
}

export function crearCasosUsoAbm({
  transaccional,
  reloj,
  generadorId,
}: DependenciasAbm): CasosUsoAbm {
  return {
    listar(definicion, parametros) {
      const { buscar, orden, direccion, pagina } = parametrosDe(
        definicion,
        parametros,
      );
      return transaccional.ejecutar(async (repos) => {
        const { registros, total } = await repos
          .abm(definicion.entidad)
          .listar({
            buscar,
            enColumnas: definicion.busqueda,
            orden,
            direccion,
            saltear: (pagina - 1) * REGISTROS_POR_PAGINA,
            cantidad: REGISTROS_POR_PAGINA,
          });
        return {
          registros,
          total,
          pagina,
          paginas: Math.max(1, Math.ceil(total / REGISTROS_POR_PAGINA)),
          buscar,
          orden,
          direccion,
        };
      });
    },

    obtener(definicion, id) {
      return transaccional.ejecutar((repos) => vigente(repos, definicion, id));
    },

    crear(actor, definicion, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          definicion.rolesQueEscriben,
          catalogo.AUT_0009,
        );
        const validado = validar(definicion, escrito);
        if (!validado.ok) {
          return validado;
        }
        const repositorio = repos.abm(definicion.entidad);
        const errores = await repetidos(
          repositorio,
          definicion,
          validado.datos,
          null,
        );
        if (Object.keys(errores).length > 0) {
          return { ok: false, errores };
        }
        const registro = crearAuditable(
          {
            ...validado.datos,
            id: identificadorDesde<string>(generadorId.generar()),
          },
          actor,
          reloj,
        );
        await repositorio.crear(actor, registro);
        return { ok: true, registro };
      });
    },

    guardar(actor, definicion, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          definicion.rolesQueEscriben,
          catalogo.AUT_0009,
        );
        const actual = await vigente(repos, definicion, id);
        const validado = validar(definicion, escrito);
        if (!validado.ok) {
          return validado;
        }
        if (sinCambios(definicion, actual.valor, validado.datos)) {
          return { ok: true, registro: actual };
        }
        const repositorio = repos.abm(definicion.entidad);
        const errores = await repetidos(
          repositorio,
          definicion,
          validado.datos,
          actual.valor.id,
        );
        if (Object.keys(errores).length > 0) {
          return { ok: false, errores };
        }
        const cambiado = marcarActualizado(
          actual,
          { ...validado.datos, id: actual.valor.id },
          actor,
          reloj,
        );
        if (!cambiado.ok) {
          throw nuevoError(catalogo.DOM_0009, { id });
        }
        await repositorio.actualizar(actor, cambiado.valor, "actualizar");
        return { ok: true, registro: cambiado.valor };
      });
    },

    marcarEliminado(actor, definicion, id) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          definicion.rolesQueEscriben,
          catalogo.AUT_0009,
        );
        const eliminado = marcarEliminado(
          await vigente(repos, definicion, id),
          actor,
          reloj,
        );
        if (!eliminado.ok) {
          throw nuevoError(catalogo.DOM_0009, { id });
        }
        await repos
          .abm(definicion.entidad)
          .actualizar(actor, eliminado.valor, "eliminar");
      });
    },
  };
}
