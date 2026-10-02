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
 * - Una fecha que no existe o un importe mal escrito vuelven en el campo (F2-03).
 * - Los `filtros` de la definición (por una relación, por el mes de una fecha)
 *   llegan en la URL con el nombre de su columna y los resuelve la base.
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
  type CamposAbm,
  type ColumnaAbm,
  type ColumnaDeOrdenAbm,
  type ColumnaSiNoAbm,
  camposDe,
  celdasDe,
  type DefinicionAbm,
  type Escrito,
  errorDeFecha,
  leerImporte,
  leerNumero,
  textoDeCampo,
  type ValoresAbm,
  valorDeCampo,
} from "./definicion.ts";
import { conDefinicion, enUso } from "./definiciones.ts";

export const REGISTROS_POR_PAGINA = 25;

const MENSAJE_UNICO = `${catalogo.DOM_0008.codigo} · ${catalogo.DOM_0008.descripcion}`;

const MENSAJE_OPCION = "Elegí una de las opciones de la lista.";

/** Prisma toma `take` como entero de 32 bits: el máximo es "todas". */
export const TODAS = 2 ** 31 - 1;

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

/** Un filtro del listado: un selector con lo que se puede elegir y lo elegido ("" es todos). */
export type FiltroListado = {
  readonly columna: string;
  readonly etiqueta: string;
  readonly opciones: readonly OpcionDeRelacion[];
  readonly elegido: string;
};

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
  readonly orden: ColumnaDeOrdenAbm<E>;
  readonly direccion: "asc" | "desc";
  readonly filtros: readonly FiltroListado[];
};

export type CasosUsoAbm = {
  listar<E extends EntidadAbm>(
    definicion: DefinicionAbm<E>,
    parametros: ParametrosListado,
  ): Promise<Listado<E>>;
  /**
   * Por cada campo de relación, los registros vigentes que se pueden elegir
   * (los que cumplen su `soloSi`). Con el `id` del registro que se edita, suma
   * lo que ya tiene elegido aunque ya no cumpla.
   */
  opciones<E extends EntidadAbm>(
    definicion: DefinicionAbm<E>,
    id?: string,
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

type Validado<D> =
  | { readonly ok: true; readonly datos: D }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Lo escrito en `campos`, convertido y validado: los datos, o el mensaje de cada campo a corregir. */
export function validarEscrito<D>(
  campos: CamposAbm,
  validacion: z.ZodType<D>,
  escrito: Escrito,
): Validado<D> {
  const valores = Object.fromEntries(
    campos.map(([nombre, campo]) => [
      nombre,
      valorDeCampo(nombre, campo, escrito),
    ]),
  );
  const errores: Record<string, string> = {};
  for (const [nombre, campo] of campos) {
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
    if (campo.tipo === "fecha") {
      const error = errorDeFecha(campo, escrito[nombre] ?? "");
      if (error !== undefined) {
        errores[nombre] = error;
      }
    }
    if (campo.tipo === "importe") {
      const leido = leerImporte(nombre, escrito);
      if ("error" in leido) {
        errores[nombre] = leido.error;
      }
    }
  }
  const leido = validacion.safeParse(valores);
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

/**
 * Las relaciones de `valores` que apuntan a un registro que no existe, está dado
 * de baja o, si la relación tiene `soloSi`, no cumple esa casilla: salvo que
 * `previos` (lo que estaba guardado) ya apuntara a él.
 */
export async function relacionesRotas(
  repos: RepositoriosEnTransaccion,
  campos: CamposAbm,
  valores: ValoresAbm,
  previos: ValoresAbm,
): Promise<ErroresPorCampo> {
  const errores: Record<string, string> = {};
  for (const [nombre, campo] of campos) {
    const id = valores[nombre];
    if (campo.tipo !== "relacion" || typeof id !== "string") {
      continue;
    }
    const destino = esquemaId.safeParse(id).success
      ? await repos.abm(campo.entidad).buscarPorId(id)
      : null;
    if (destino === null || destino.eliminadoEn !== undefined) {
      errores[nombre] = MENSAJE_OPCION;
    } else if (campo.soloSi !== undefined && id !== previos[nombre]) {
      const propios: ValoresAbm = destino.valor;
      if (propios[campo.soloSi] !== true) {
        errores[nombre] = MENSAJE_OPCION;
      }
    }
  }
  return errores;
}

/** Lo que solo la base sabe: un valor único repetido o una relación rota. */
async function erroresDeBase<E extends EntidadAbm>(
  repos: RepositoriosEnTransaccion,
  definicion: DefinicionAbm<E>,
  datos: DatosAbm<E>,
  actual: RegistroAbm<E> | null,
): Promise<ErroresPorCampo> {
  return {
    ...(await relacionesRotas(
      repos,
      camposDe(definicion),
      datos,
      actual?.valor ?? {},
    )),
    ...(await repetidos(
      repos.abm(definicion.entidad),
      definicion,
      datos,
      actual?.valor.id ?? null,
    )),
  };
}

/** Un importe es el mismo si tiene los mismos centavos en la misma moneda, no por ser el mismo objeto. */
function mismoValor(
  a: ValoresAbm[string] | undefined,
  b: ValoresAbm[string] | undefined,
): boolean {
  return typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null
    ? a.centavos === b.centavos && a.moneda === b.moneda
    : a === b;
}

function sinCambios<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  actuales: ValoresAbm,
  nuevos: ValoresAbm,
): boolean {
  return camposDe(definicion).every(([campo]) =>
    mismoValor(actuales[campo], nuevos[campo]),
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

/** `nombre` es una casilla de sí/no de `definicion`. */
function esCasilla<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  nombre: string,
): nombre is ColumnaSiNoAbm<E> {
  return camposDe(definicion).some(
    ([clave, campo]) => clave === nombre && campo.tipo === "siNo",
  );
}

/** Los registros vigentes de `destino` (si hay `soloSi`, los que lo tienen marcado), por la columna que se muestra. */
export async function opcionesDe<E extends EntidadAbm>(
  repos: RepositoriosEnTransaccion,
  destino: DefinicionAbm<E>,
  mostrar: string,
  soloSi?: string,
): Promise<readonly OpcionDeRelacion[]> {
  const { registros } = await repos.abm(destino.entidad).listar({
    buscaEn: [],
    filtros: [],
    marcadas:
      soloSi !== undefined && esCasilla(destino, soloSi) ? [soloSi] : [],
    mes: null,
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

const esquemaMes = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

/** Lo elegido en cada filtro de la URL, por columna; lo que no sirve se descarta. */
function filtrosElegidos<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  parametros: ParametrosListado,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    (definicion.filtros ?? []).flatMap((columna) => {
      const esquema =
        definicion.campos[columna].tipo === "fecha" ? esquemaMes : esquemaId;
      const leido = esquema.safeParse(parametros[columna]);
      return leido.success ? [[columna, leido.data]] : [];
    }),
  );
}

/** La búsqueda, el orden y la página que pide la URL; lo inválido cae a su valor por defecto. */
export function parametrosDe<O extends string>(
  definicion: {
    readonly orden: readonly [O, ...O[]];
    readonly direccionInicial?: "asc" | "desc";
  },
  parametros: ParametrosListado,
) {
  const leidos = z
    .object({
      buscar: z.string().trim().max(100).catch(""),
      direccion: z
        .enum(["asc", "desc"])
        .catch(definicion.direccionInicial ?? "asc"),
      pagina: z.coerce.number().int().min(1).catch(1),
    })
    .parse(parametros);
  const orden =
    definicion.orden.find((columna) => columna === parametros.orden) ??
    definicion.orden[0];
  return { ...leidos, orden };
}

/** Por filtro, lo que se puede elegir: los registros vigentes de la relación, o los meses con registros. */
async function filtrosDe<E extends EntidadAbm>(
  repos: RepositoriosEnTransaccion,
  definicion: DefinicionAbm<E>,
  elegidos: Readonly<Record<string, string>>,
): Promise<readonly FiltroListado[]> {
  const filtros: FiltroListado[] = [];
  for (const columna of definicion.filtros ?? []) {
    const campo = definicion.campos[columna];
    const opciones =
      campo.tipo === "relacion"
        ? await conDefinicion(campo.entidad, (destino) =>
            opcionesDe(repos, destino, campo.mostrar),
          )
        : (await repos.abm(definicion.entidad).mesesCon(columna)).map(
            (mes) => ({
              valor: mes,
              texto: `${mes.slice(5)}/${mes.slice(0, 4)}`,
            }),
          );
    filtros.push({
      columna,
      etiqueta: campo.tipo === "fecha" ? "Mes" : campo.etiqueta,
      opciones,
      elegido: elegidos[columna] ?? "",
    });
  }
  return filtros;
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

/** dd/mm/aaaa hh:mm de una fecha civil argentina. */
export function cuandoDe({ anio, mes, dia, hora, minuto }: FechaHora): string {
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

/** Por campo de relación de `campos`, lo que se puede elegir, más lo que `previos` ya tenía elegido aunque ya no cumpla. */
export async function elegiblesDe(
  repos: RepositoriosEnTransaccion,
  campos: CamposAbm,
  previos: ValoresAbm,
): Promise<OpcionesPorCampo> {
  const opciones: Record<string, readonly OpcionDeRelacion[]> = {};
  for (const [nombre, campo] of campos) {
    if (campo.tipo !== "relacion") {
      continue;
    }
    const elegibles = await conDefinicion(campo.entidad, (destino) =>
      opcionesDe(repos, destino, campo.mostrar, campo.soloSi),
    );
    const elegido = previos[nombre];
    const yaElegido =
      typeof elegido === "string" &&
      !elegibles.some(({ valor }) => valor === elegido)
        ? await repos.abm(campo.entidad).buscarPorIds([elegido])
        : [];
    opciones[nombre] = [
      ...elegibles,
      ...yaElegido.map(({ valor }) => {
        const destino: ValoresAbm = valor;
        return { valor: valor.id, texto: String(destino[campo.mostrar]) };
      }),
    ];
  }
  return opciones;
}

/** Cómo se nombra a quien hizo algo: el email de la persona, o el nombre del proceso del sistema. */
export async function nombresDeActores(
  repos: RepositoriosEnTransaccion,
): Promise<(actor: Actor) => string> {
  const emails = new Map(
    (await repos.usuarios.listar()).map(({ valor }) => [valor.id, valor.email]),
  );
  return (actor) =>
    actor.tipo === "sistema"
      ? actor.proceso
      : (emails.get(actor.usuarioId) ?? actor.usuarioId);
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
      const elegidos = filtrosElegidos(definicion, parametros);
      const columnaDeMes = (definicion.filtros ?? []).find(
        (columna) => definicion.campos[columna].tipo === "fecha",
      );
      const mes =
        columnaDeMes === undefined ? undefined : elegidos[columnaDeMes];
      return transaccional.ejecutar(async (repos) => {
        const { registros, total } = await repos
          .abm(definicion.entidad)
          .listar({
            buscaEn: definicion.busqueda.flatMap((columna) => {
              const texto =
                normalizarBusqueda(definicion, columna)?.(buscar) ?? buscar;
              return buscar === "" || texto === "" ? [] : [{ columna, texto }];
            }),
            filtros: (definicion.filtros ?? []).flatMap((columna) => {
              const igual = elegidos[columna];
              return definicion.campos[columna].tipo === "relacion" &&
                igual !== undefined
                ? [{ columna, igual }]
                : [];
            }),
            marcadas: [],
            mes:
              columnaDeMes === undefined || mes === undefined
                ? null
                : { columna: columnaDeMes, mes },
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
              celdasDe(definicion, valor, etiquetas, reloj.ahora()),
            ]),
          ),
          total,
          pagina,
          paginas: Math.max(1, Math.ceil(total / REGISTROS_POR_PAGINA)),
          buscar,
          orden,
          direccion,
          filtros: await filtrosDe(repos, definicion, elegidos),
        };
      });
    },

    opciones(definicion, id) {
      return transaccional.ejecutar(async (repos) => {
        const editado =
          id !== undefined && esquemaId.safeParse(id).success
            ? await repos.abm(definicion.entidad).buscarPorId(id)
            : null;
        return elegiblesDe(repos, camposDe(definicion), editado?.valor ?? {});
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
        const quien = await nombresDeActores(repos);
        return registros.flatMap((registro) =>
          cambiosDe(definicion, registro, quien(registro.actor)),
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
        const validado = validarEscrito(
          camposDe(definicion),
          definicion.validacion,
          escrito,
        );
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
        const validado = validarEscrito(
          camposDe(definicion),
          definicion.validacion,
          escrito,
        );
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
          actual,
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
