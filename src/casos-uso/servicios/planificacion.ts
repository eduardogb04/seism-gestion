/**
 * Los hitos y los recursos de un servicio (F3-02). Todo es opcional y se carga
 * en «Adjudicado» y en «En ejecución»; tildar un hito, solo en «En
 * ejecución». Afuera es `DOM-0018`. Los hitos se reordenan y se quitan mientras
 * no estén realizados (`DOM-0039`) y se copian de una plantilla (F6-02). El responsable y la fecha estimada de
 * inicio se cambian al editar el servicio (`servicios.ts`), con la misma regla.
 *
 * - Toda escritura recibe el `Actor` primero, exige un rol que escriba
 *   (`AUT-0009`) y corre entera en una transacción, con la fila del servicio
 *   tomada.
 * - Lo que la persona corrige vuelve por campo, no se lanza.
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
import { formatearISO, type Reloj } from "../../dominio/compartido/reloj.ts";
import {
  admiteCarga,
  type Carga,
  cicloServicio,
} from "../../dominio/servicios/estados.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type { RegistroDe } from "../../puertos/repositorios/abm.ts";
import type {
  DatosHito,
  DatosRecurso,
  Hito,
} from "../../puertos/repositorios/planificacion.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import {
  type ErroresPorCampo,
  elegiblesDe,
  nombresDeActores,
  type OpcionesPorCampo,
  relacionesRotas,
  TODAS,
  validarEscrito,
} from "../abm/abm.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
  type OpcionAbm,
} from "../abm/definicion.ts";
import { obligatorio, opcional } from "../abm/validaciones.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import { exigirEtapa, historialDe } from "./ciclo.ts";
import {
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  servicioVigente,
  servicioVigenteBloqueado,
} from "./servicios.ts";

const esquemaId = z.uuid();

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

type Resultado =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

export type DetalleDePlanificacion = {
  readonly hitos: readonly {
    readonly id: string;
    readonly texto: string;
    /** `null` si todavía no se hizo. */
    readonly realizado: {
      /** dd/mm/aaaa. */
      readonly fecha: string;
      /** El email de quien lo tildó. */
      readonly autor: string;
    } | null;
  }[];
  readonly recursos: readonly {
    readonly id: string;
    readonly tipo: string;
    /** La patente del tractor si es un camión; si no, la descripción. */
    readonly detalle: string;
    /** En qué grupo se muestra: las personas son «Humanos»; lo demás, «Materiales». */
    readonly grupo: "humanos" | "materiales";
    /** Solo un material la lleva; vacía si no se cargó. */
    readonly cantidad: string;
    /** dd/mm/aaaa; vacío si no se cargó. */
    readonly desde: string;
    readonly hasta: string;
  }[];
  /** Las plantillas que se pueden aplicar: primero las del tipo del servicio y después las genéricas. */
  readonly plantillas: readonly {
    readonly id: string;
    readonly nombre: string;
  }[];
  /** ¿La etapa actual admite cargar hitos y recursos? */
  readonly planificable: boolean;
  /** ¿Admite tildar hitos? */
  readonly tildable: boolean;
};

export type CasosUsoPlanificacion = {
  ver(servicioId: string): Promise<DetalleDePlanificacion>;
  crearHito(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
  ): Promise<Resultado>;
  /** Quita el hito; `DOM-0039` si ya está realizado. */
  marcarEliminadoHito(actor: Actor, id: string): Promise<void>;
  /** Intercambia el lugar del hito con el de arriba o el de abajo; `DOM-0039` si ya está realizado. */
  cambiarOrdenDeHito(
    actor: Actor,
    id: string,
    sentido: "subir" | "bajar",
  ): Promise<void>;
  /**
   * Copia los hitos de la plantilla al final de los del servicio, como hitos
   * propios: cambiar la plantilla después no los toca.
   */
  crearHitosDePlantilla(
    actor: Actor,
    servicioId: string,
    plantillaId: string,
  ): Promise<void>;
  /** Tilda el hito (con la fecha de hoy y quien lo tilda) o lo destilda. */
  cambiarRealizadoDeHito(
    actor: Actor,
    id: string,
    realizado: boolean,
  ): Promise<void>;
  formularioDeRecurso(): Promise<{
    readonly campos: CamposAbm;
    readonly elegibles: OpcionesPorCampo;
    readonly escrito: Escrito;
  }>;
  crearRecurso(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
  ): Promise<Resultado>;
  marcarEliminadoRecurso(actor: Actor, id: string): Promise<void>;
};

export const CAMPOS_DE_HITO: CamposAbm = [
  ["texto", { tipo: "texto", etiqueta: "Hito" }],
];

const VALIDACION_DE_HITO = z.object({ texto: obligatorio("el hito", 200) });

const TIPOS_DE_RECURSO: readonly OpcionAbm[] = [
  { valor: "persona", etiqueta: "Persona" },
  { valor: "camion", etiqueta: "Camión" },
  { valor: "equipo", etiqueta: "Equipo" },
  { valor: "material", etiqueta: "Material" },
];

const CAMPOS_DE_RECURSO: CamposAbm = [
  ["tipo", { tipo: "opcion", etiqueta: "Tipo", opciones: TIPOS_DE_RECURSO }],
  [
    "camionId",
    {
      tipo: "relacion",
      etiqueta: "Camión",
      entidad: "Camion",
      mostrar: "patenteTractor",
    },
  ],
  ["descripcion", { tipo: "texto", etiqueta: "Descripción", opcional: true }],
  ["cantidad", { tipo: "texto", etiqueta: "Cantidad", opcional: true }],
  ["desde", { tipo: "fecha", etiqueta: "Desde", opcional: true }],
  ["hasta", { tipo: "fecha", etiqueta: "Hasta", opcional: true }],
];

const VALIDACION_DE_RECURSO: z.ZodType<Omit<DatosRecurso, "servicioId">> = z
  .object({
    tipo: z.string(),
    camionId: z.string().nullable(),
    descripcion: opcional(200),
    cantidad: opcional(100),
    desde: z.string().nullable(),
    hasta: z.string().nullable(),
  })
  .superRefine((recurso, contexto) => {
    const esCamion = recurso.tipo === "camion";
    const errores = [
      [esCamion && recurso.camionId === null, "camionId", "Elegí el camión."],
      [
        !esCamion && recurso.camionId !== null,
        "camionId",
        "Solo un camión lleva camión: elegí «Ninguno».",
      ],
      [
        !esCamion && recurso.descripcion === null,
        "descripcion",
        "Escribí la descripción.",
      ],
      [
        esCamion && recurso.descripcion !== null,
        "descripcion",
        "Un camión no lleva descripción: dejala vacía.",
      ],
      [
        recurso.tipo !== "material" && recurso.cantidad !== null,
        "cantidad",
        "Solo un material lleva cantidad: dejala vacía.",
      ],
      [
        // Dos días `aaaa-mm-dd` se comparan como texto.
        recurso.desde !== null &&
          recurso.hasta !== null &&
          recurso.hasta < recurso.desde,
        "hasta",
        "No puede ser anterior a «Desde».",
      ],
    ] as const;
    for (const [hay, path, message] of errores) {
      if (hay) {
        contexto.addIssue({ code: "custom", path: [path], message });
      }
    }
  });

/** Un día `aaaa-mm-dd` como se muestra; vacío si no se cargó. */
function aTexto(dia: string | null): string {
  return dia === null ? "" : diaConBarras(dia);
}

/** El registro con ese id; `DOM-0009` si no existe o ya está dado de baja. */
export async function vigentePorId<D>(
  buscar: (id: string) => Promise<RegistroDe<D> | null>,
  entidad: string,
  id: string,
): Promise<RegistroDe<D>> {
  const registro = esquemaId.safeParse(id).success ? await buscar(id) : null;
  if (registro === null || registro.eliminadoEn !== undefined) {
    throw nuevoError(catalogo.DOM_0009, { entidad, id });
  }
  return registro;
}

/** `DOM-0039` si el hito ya se hizo: un hito realizado no se quita ni se reordena. */
function exigirNoRealizado(hito: Hito["valor"]): void {
  if (hito.realizadoEn !== null) {
    throw nuevoError(catalogo.DOM_0039, { id: hito.id });
  }
}

/** Las plantillas vigentes del tipo del servicio y, después, las genéricas; las de otro tipo no se ofrecen. */
async function plantillasOfrecidas(
  repos: RepositoriosEnTransaccion,
  tipoServicioId: string,
) {
  const { registros } = await repos.abm("PlantillaHitos").listar({
    buscaEn: [],
    filtros: [],
    marcadas: [],
    mes: null,
    orden: "nombre",
    direccion: "asc",
    saltear: 0,
    cantidad: TODAS,
  });
  return [tipoServicioId, null].flatMap((tipo) =>
    registros.flatMap(({ valor }) =>
      valor.tipoServicioId === tipo
        ? [{ id: valor.id, nombre: valor.nombre }]
        : [],
    ),
  );
}

/** Rol, servicio tomado y etapa: lo que toda escritura exige antes de mirar lo escrito. */
export async function prepararEscritura(
  repos: RepositoriosEnTransaccion,
  actor: Actor,
  servicioId: string,
  carga: Carga,
) {
  await exigirRol(
    repos.usuarios,
    actor,
    ROLES_QUE_ESCRIBEN_SERVICIOS,
    catalogo.AUT_0009,
  );
  await servicioVigenteBloqueado(repos, servicioId);
  await exigirEtapa(repos, servicioId, carga);
}

export function crearCasosUsoPlanificacion({
  transaccional,
  reloj,
  generadorId,
}: Dependencias): CasosUsoPlanificacion {
  const nuevoId = () => identificadorDesde<string>(generadorId.generar());

  /** Crea los hitos al final de los que ya tiene el servicio. */
  async function agregarHitos(
    actor: Actor,
    repos: RepositoriosEnTransaccion,
    servicioId: string,
    textos: readonly string[],
  ): Promise<void> {
    const ultimo = (await repos.hitos.listarDe(servicioId)).at(-1);
    for (const [posicion, texto] of textos.entries()) {
      await repos.hitos.crear(
        actor,
        crearAuditable(
          {
            texto,
            servicioId,
            orden: (ultimo?.valor.orden ?? 0) + posicion + 1,
            realizadoEn: null,
            realizadoPor: null,
            id: nuevoId(),
          },
          actor,
          reloj,
        ),
      );
    }
  }

  /** El hito con otro lugar en la lista. */
  async function guardarOrden(
    actor: Actor,
    repos: RepositoriosEnTransaccion,
    hito: RegistroDe<DatosHito>,
    orden: number,
  ): Promise<void> {
    const cambiado = marcarActualizado(
      hito,
      { ...hito.valor, orden },
      actor,
      reloj,
    );
    if (!cambiado.ok) {
      throw nuevoError(catalogo.DOM_0009, {
        entidad: "Hito",
        id: hito.valor.id,
      });
    }
    await repos.hitos.actualizar(actor, cambiado.valor, "actualizar");
  }

  return {
    ver(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        const servicio = await servicioVigente(repos, servicioId);
        const estado = cicloServicio.estadoActual(
          await historialDe(repos, servicioId),
        );
        const planificable = admiteCarga(estado, "planificacion");
        const quien = await nombresDeActores(repos);
        const recursos = await repos.recursos.listarDe(servicioId);
        const camiones = new Map<string, string>(
          (
            await repos
              .abm("Camion")
              .buscarPorIds(
                recursos.flatMap(({ valor: r }) =>
                  r.camionId === null ? [] : [r.camionId],
                ),
              )
          ).map(({ valor: camion }) => [camion.id, camion.patenteTractor]),
        );
        return {
          hitos: (await repos.hitos.listarDe(servicioId)).map(
            ({ valor: hito }) => ({
              id: hito.id,
              texto: hito.texto,
              realizado:
                hito.realizadoEn === null || hito.realizadoPor === null
                  ? null
                  : {
                      fecha: diaConBarras(hito.realizadoEn),
                      autor: quien(hito.realizadoPor),
                    },
            }),
          ),
          recursos: recursos.map(({ valor: recurso }) => ({
            id: recurso.id,
            tipo:
              TIPOS_DE_RECURSO.find(({ valor: t }) => t === recurso.tipo)
                ?.etiqueta ?? recurso.tipo,
            detalle:
              (recurso.camionId === null
                ? recurso.descripcion
                : camiones.get(recurso.camionId)) ?? "",
            grupo: recurso.tipo === "persona" ? "humanos" : "materiales",
            cantidad: recurso.cantidad ?? "",
            desde: aTexto(recurso.desde),
            hasta: aTexto(recurso.hasta),
          })),
          plantillas: planificable
            ? await plantillasOfrecidas(repos, servicio.valor.tipoServicioId)
            : [],
          planificable,
          tildable: admiteCarga(estado, "tildarHito"),
        };
      });
    },

    crearHito(actor, servicioId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await prepararEscritura(repos, actor, servicioId, "planificacion");
        const validado = validarEscrito(
          CAMPOS_DE_HITO,
          VALIDACION_DE_HITO,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        await agregarHitos(actor, repos, servicioId, [validado.datos.texto]);
        return { ok: true };
      });
    },

    marcarEliminadoHito(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(repos.hitos.buscarPorId, "Hito", id);
        await prepararEscritura(
          repos,
          actor,
          actual.valor.servicioId,
          "planificacion",
        );
        exigirNoRealizado(actual.valor);
        const eliminado = marcarEliminado(actual, actor, reloj);
        if (!eliminado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Hito", id });
        }
        await repos.hitos.actualizar(actor, eliminado.valor, "eliminar");
      });
    },

    cambiarOrdenDeHito(actor, id, sentido) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(repos.hitos.buscarPorId, "Hito", id);
        const { servicioId } = actual.valor;
        await prepararEscritura(repos, actor, servicioId, "planificacion");
        exigirNoRealizado(actual.valor);
        const hitos = await repos.hitos.listarDe(servicioId);
        const lugar = hitos.findIndex(({ valor }) => valor.id === id);
        const vecino = hitos[lugar + (sentido === "subir" ? -1 : 1)];
        if (vecino === undefined) {
          return;
        }
        await guardarOrden(actor, repos, actual, vecino.valor.orden);
        await guardarOrden(actor, repos, vecino, actual.valor.orden);
      });
    },

    crearHitosDePlantilla(actor, servicioId, plantillaId) {
      return transaccional.ejecutar(async (repos) => {
        await prepararEscritura(repos, actor, servicioId, "planificacion");
        const plantilla = await vigentePorId(
          repos.abm("PlantillaHitos").buscarPorId,
          "PlantillaHitos",
          plantillaId,
        );
        await agregarHitos(actor, repos, servicioId, plantilla.valor.hitos);
      });
    },

    cambiarRealizadoDeHito(actor, id, realizado) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(repos.hitos.buscarPorId, "Hito", id);
        await prepararEscritura(
          repos,
          actor,
          actual.valor.servicioId,
          "tildarHito",
        );
        // Tildar uno ya tildado no le cambia la fecha ni el autor.
        if ((actual.valor.realizadoEn !== null) === realizado) {
          return;
        }
        const cambiado = marcarActualizado(
          actual,
          {
            ...actual.valor,
            realizadoEn: realizado
              ? formatearISO(reloj.ahora()).slice(0, 10)
              : null,
            realizadoPor: realizado ? actor : null,
          },
          actor,
          reloj,
        );
        if (!cambiado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Hito", id });
        }
        await repos.hitos.actualizar(actor, cambiado.valor, "actualizar");
      });
    },

    formularioDeRecurso() {
      return transaccional.ejecutar(async (repos) => ({
        campos: CAMPOS_DE_RECURSO,
        elegibles: await elegiblesDe(repos, CAMPOS_DE_RECURSO, {}),
        escrito: { tipo: "persona" },
      }));
    },

    crearRecurso(actor, servicioId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await prepararEscritura(repos, actor, servicioId, "planificacion");
        const validado = validarEscrito(
          CAMPOS_DE_RECURSO,
          VALIDACION_DE_RECURSO,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        const errores = await relacionesRotas(
          repos,
          CAMPOS_DE_RECURSO,
          validado.datos,
          {},
        );
        if (Object.keys(errores).length > 0) {
          return { ok: false, errores };
        }
        await repos.recursos.crear(
          actor,
          crearAuditable(
            { ...validado.datos, servicioId, id: nuevoId() },
            actor,
            reloj,
          ),
        );
        return { ok: true };
      });
    },

    marcarEliminadoRecurso(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(
          repos.recursos.buscarPorId,
          "Recurso",
          id,
        );
        await prepararEscritura(
          repos,
          actor,
          actual.valor.servicioId,
          "planificacion",
        );
        const eliminado = marcarEliminado(actual, actor, reloj);
        if (!eliminado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Recurso", id });
        }
        await repos.recursos.actualizar(actor, eliminado.valor, "eliminar");
      });
    },
  };
}
