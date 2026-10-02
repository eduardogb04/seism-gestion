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
 *   defecto. Buscar, ordenar y paginar los resuelve la base; lo que se muestra
 *   de un registro relacionado se trae en una sola consulta por página.
 * - Una opción fuera de su lista, o una relación con un registro que no existe
 *   o está dado de baja, vuelve en el campo. Dar de baja un registro al que
 *   apunta otro vigente se rechaza con `DOM-0010`.
 * - `historial` lee de `auditoria` cómo cambiaron los campos que la
 *   definición declara (F1-05); no hay una tabla de historial aparte.
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  crearAuditable,
  marcarActualizado,
  marcarEliminado,
  type RegistroAuditoria,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import type { FechaHora, Reloj } from "../../dominio/compartido/reloj.ts";
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
  celdasDe,
  type DefinicionAbm,
  type Escrito,
  leerNumero,
  textoDeCampo,
  type ValoresAbm,
  valorDeCampo,
} from "./definicion.ts";
import { conDefinicion, enUso } from "./definiciones.ts";

const REGISTROS_POR_PAGINA = 25;

const MENSAJE_UNICO = `${catalogo.DOM_0008.codigo} · ${catalogo.DOM_0008.descripcion}`;

const MENSAJE_OPCION = "Elegí una de las opciones de la lista.";

/** Prisma toma `take` como entero de 32 bits: el máximo es "todas". */
const TODAS = 2 ** 31 - 1;

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

/** Un registro elegible en el selector de una relación. */
export type OpcionDeRelacion = {
  readonly valor: string;
  readonly texto: string;
};

/** Por campo de relación, lo que se puede elegir. */
export type OpcionesPorCampo = Readonly<
  Record<string, readonly OpcionDeRelacion[]>
>;

/** Un cambio de un campo con historial, listo para mostrarse. */
export type CambioAbm = {
  /** dd/mm/aaaa hh:mm, hora argentina. */
  readonly cuando: string;
  /** El email de la persona, o el nombre del proceso del sistema. */
  readonly quien: string;
  readonly campo: string;
  readonly de: string;
  readonly a: string;
};

export type Listado<E extends EntidadAbm> = {
  readonly registros: readonly RegistroAbm<E>[];
  /** Las celdas de cada registro (por id), en el orden de `definicion.listado`. */
  readonly celdas: Readonly<Record<string, readonly string[]>>;
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
  /** Por cada campo de relación, los registros vigentes que se pueden elegir. */
  opciones<E extends EntidadAbm>(
    definicion: DefinicionAbm<E>,
  ): Promise<OpcionesPorCampo>;
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
  /**
   * Los cambios de los campos con `historial` del registro, del más nuevo al
   * más viejo. El alta no es un cambio. Sin `historial` declarado, ninguno.
   */
  historial<E extends EntidadAbm>(
    definicion: DefinicionAbm<E>,
    id: string,
  ): Promise<readonly CambioAbm[]>;
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
  const valores = Object.fromEntries(
    camposDe(definicion).map(([nombre, campo]) => [
      nombre,
      valorDeCampo(campo, escrito[nombre] ?? ""),
    ]),
  );
  const errores: Record<string, string> = {};
  for (const [nombre, campo] of camposDe(definicion)) {
    if (
      campo.tipo === "opcion" &&
      !campo.opciones.some(({ valor }) => valor === valores[nombre])
    ) {
      errores[nombre] = MENSAJE_OPCION;
    }
    if (campo.tipo === "numero") {
      const leido = leerNumero(campo, escrito[nombre] ?? "");
      if ("error" in leido) {
        errores[nombre] = leido.error;
      }
    }
  }
  const leido = definicion.validacion.safeParse(valores);
  if (leido.success && Object.keys(errores).length === 0) {
    return { ok: true, datos: leido.data };
  }
  if (!leido.success) {
    for (const { path, message } of leido.error.issues) {
      errores[String(path[0])] ??= message;
    }
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
  for (const unico of definicion.unicos) {
    const { columnas, mensaje } =
      typeof unico === "string"
        ? { columnas: [unico], mensaje: MENSAJE_UNICO }
        : unico;
    const valores = columnas.flatMap((columna) => {
      const valor = datos[columna];
      return typeof valor === "string"
        ? [
            {
              columna,
              valor,
              exacto: definicion.campos[columna].tipo === "relacion",
            },
          ]
        : [];
    });
    const ultima = columnas.at(-1);
    if (ultima === undefined || valores.length < columnas.length) {
      continue;
    }
    const otro = await repositorio.buscarPorValores(valores);
    if (otro !== null && otro.valor.id !== propio) {
      errores[ultima] = mensaje;
    }
  }
  return errores;
}

/** Las relaciones de `datos` que apuntan a un registro que no existe o está dado de baja. */
async function relacionesRotas<E extends EntidadAbm>(
  repos: RepositoriosEnTransaccion,
  definicion: DefinicionAbm<E>,
  datos: DatosAbm<E>,
): Promise<ErroresPorCampo> {
  const valores: ValoresAbm = datos;
  const errores: Record<string, string> = {};
  for (const [nombre, campo] of camposDe(definicion)) {
    const id = valores[nombre];
    if (campo.tipo !== "relacion" || typeof id !== "string") {
      continue;
    }
    const destino = esquemaId.safeParse(id).success
      ? await repos.abm(campo.entidad).buscarPorId(id)
      : null;
    if (destino === null || destino.eliminadoEn !== undefined) {
      errores[nombre] = MENSAJE_OPCION;
    }
  }
  return errores;
}

/** Lo que solo la base sabe: un valor único repetido o una relación rota. */
async function erroresDeBase<E extends EntidadAbm>(
  repos: RepositoriosEnTransaccion,
  definicion: DefinicionAbm<E>,
  datos: DatosAbm<E>,
  propio: string | null,
): Promise<ErroresPorCampo> {
  return {
    ...(await relacionesRotas(repos, definicion, datos)),
    ...(await repetidos(
      repos.abm(definicion.entidad),
      definicion,
      datos,
      propio,
    )),
  };
}

function sinCambios<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  actuales: ValoresAbm,
  nuevos: ValoresAbm,
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

/** Lo que se muestra de cada registro relacionado con `registros`, por id, en una sola consulta por campo. */
async function etiquetasDe<E extends EntidadAbm>(
  repos: RepositoriosEnTransaccion,
  definicion: DefinicionAbm<E>,
  registros: readonly RegistroAbm<E>[],
): Promise<ReadonlyMap<string, string>> {
  const etiquetas = new Map<string, string>();
  for (const [nombre, campo] of camposDe(definicion)) {
    if (campo.tipo !== "relacion") {
      continue;
    }
    const ids = new Set<string>();
    for (const { valor } of registros) {
      const datos: ValoresAbm = valor;
      const id = datos[nombre];
      if (typeof id === "string") {
        ids.add(id);
      }
    }
    if (ids.size === 0) {
      continue;
    }
    for (const { valor } of await repos
      .abm(campo.entidad)
      .buscarPorIds([...ids])) {
      const destino: ValoresAbm = valor;
      const texto = destino[campo.mostrar];
      if (typeof texto === "string") {
        etiquetas.set(valor.id, texto);
      }
    }
  }
  return etiquetas;
}

/** Los registros vigentes de `destino`, por la columna que se muestra. */
async function opcionesDe<E extends EntidadAbm>(
  repos: RepositoriosEnTransaccion,
  destino: DefinicionAbm<E>,
  mostrar: string,
): Promise<readonly OpcionDeRelacion[]> {
  const { registros } = await repos.abm(destino.entidad).listar({
    buscaEn: [],
    orden:
      destino.orden.find((columna) => columna === mostrar) ?? destino.orden[0],
    direccion: "asc",
    saltear: 0,
    cantidad: TODAS,
  });
  return registros.map(({ valor }) => {
    const datos: ValoresAbm = valor;
    return { valor: valor.id, texto: String(datos[mostrar]) };
  });
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

function normalizarBusqueda<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  columna: ColumnaAbm<E>,
): ((buscado: string) => string) | undefined {
  const normalizadores: Readonly<
    Record<string, ((buscado: string) => string) | undefined>
  > = definicion.normalizarBusqueda ?? {};
  return normalizadores[columna];
}

const SIN_ETIQUETAS: ReadonlyMap<string, string> = new Map();

/** Lo que guardó la auditoría, como valores de un registro: lo demás no es un dato de la definición. */
function valoresDe(foto: Readonly<Record<string, unknown>>): ValoresAbm {
  return Object.fromEntries(
    Object.entries(foto).filter(
      (entrada): entrada is [string, string | boolean | number | null] =>
        entrada[1] === null ||
        ["string", "boolean", "number"].includes(typeof entrada[1]),
    ),
  );
}

function cuandoDe({ anio, mes, dia, hora, minuto }: FechaHora): string {
  const dos = (numero: number) => String(numero).padStart(2, "0");
  return `${dos(dia)}/${dos(mes)}/${anio} ${dos(hora)}:${dos(minuto)}`;
}

/** Los campos con historial que cambiaron entre `antes` y `despues` de un registro de auditoría. */
function cambiosDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  registro: RegistroAuditoria,
  quien: string,
): readonly CambioAbm[] {
  if (registro.antes === null || registro.despues === null) {
    return [];
  }
  const antes = valoresDe(registro.antes);
  const despues = valoresDe(registro.despues);
  return (definicion.historial ?? []).flatMap((nombre) =>
    antes[nombre] === despues[nombre]
      ? []
      : [
          {
            cuando: cuandoDe(registro.en),
            quien,
            campo: definicion.campos[nombre].etiqueta,
            de: textoDeCampo(definicion, nombre, antes, SIN_ETIQUETAS),
            a: textoDeCampo(definicion, nombre, despues, SIN_ETIQUETAS),
          },
        ],
  );
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
            buscaEn: definicion.busqueda.flatMap((columna) => {
              const texto =
                normalizarBusqueda(definicion, columna)?.(buscar) ?? buscar;
              return buscar === "" || texto === "" ? [] : [{ columna, texto }];
            }),
            orden,
            direccion,
            saltear: (pagina - 1) * REGISTROS_POR_PAGINA,
            cantidad: REGISTROS_POR_PAGINA,
          });
        const etiquetas = await etiquetasDe(repos, definicion, registros);
        return {
          registros,
          celdas: Object.fromEntries(
            registros.map(({ valor }) => [
              valor.id,
              celdasDe(definicion, valor, etiquetas),
            ]),
          ),
          total,
          pagina,
          paginas: Math.max(1, Math.ceil(total / REGISTROS_POR_PAGINA)),
          buscar,
          orden,
          direccion,
        };
      });
    },

    opciones(definicion) {
      return transaccional.ejecutar(async (repos) => {
        const opciones: Record<string, readonly OpcionDeRelacion[]> = {};
        for (const [nombre, campo] of camposDe(definicion)) {
          if (campo.tipo === "relacion") {
            opciones[nombre] = await conDefinicion(campo.entidad, (destino) =>
              opcionesDe(repos, destino, campo.mostrar),
            );
          }
        }
        return opciones;
      });
    },

    historial(definicion, id) {
      if ((definicion.historial ?? []).length === 0) {
        return Promise.resolve([]);
      }
      return transaccional.ejecutar(async (repos) => {
        const registros = await repos.auditoria.registrosDe(
          definicion.entidad,
          id,
        );
        const emails = new Map(
          (await repos.usuarios.listar()).map(({ valor }) => [
            valor.id,
            valor.email,
          ]),
        );
        return registros.flatMap((registro) =>
          cambiosDe(
            definicion,
            registro,
            registro.actor.tipo === "sistema"
              ? registro.actor.proceso
              : (emails.get(registro.actor.usuarioId) ??
                  registro.actor.usuarioId),
          ),
        );
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
        const errores = await erroresDeBase(
          repos,
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
        const errores = await erroresDeBase(
          repos,
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
        const actual = await vigente(repos, definicion, id);
        if (await enUso(repos, definicion.entidad, id)) {
          throw nuevoError(catalogo.DOM_0010, {
            entidad: definicion.entidad,
            id,
          });
        }
        const eliminado = marcarEliminado(actual, actor, reloj);
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
