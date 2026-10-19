/**
 * La planificación y la ejecución de un servicio (F3-02): el responsable y la
 * fecha estimada de inicio, los hitos y los recursos. Todo es opcional y se
 * carga en «Adjudicado» y en «En ejecución»; tildar un hito, solo en «En
 * ejecución». Afuera es `DOM-0018`.
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
import type { DatosRecurso } from "../../puertos/repositorios/planificacion.ts";
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
  responsables,
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

export type HitoListado = {
  readonly id: string;
  readonly texto: string;
  /** `null` si todavía no se hizo. */
  readonly realizado: {
    /** dd/mm/aaaa. */
    readonly fecha: string;
    /** El email de quien lo tildó. */
    readonly autor: string;
  } | null;
};

export type RecursoListado = {
  readonly id: string;
  readonly tipo: string;
  /** La patente del tractor si es un camión; si no, la descripción. */
  readonly detalle: string;
  /** dd/mm/aaaa; vacío si no se cargó. */
  readonly desde: string;
  readonly hasta: string;
};

export type DetalleDePlanificacion = {
  /** El email. */
  readonly responsable: string;
  /** dd/mm/aaaa; vacío si no se cargó. */
  readonly fechaInicioEstimada: string;
  readonly hitos: readonly HitoListado[];
  readonly recursos: readonly RecursoListado[];
  /** ¿La etapa actual admite cambiar la planificación, los hitos y los recursos? */
  readonly planificable: boolean;
  /** ¿Admite tildar hitos? */
  readonly tildable: boolean;
};

export type FormularioDePlanificacion = {
  readonly campos: CamposAbm;
  readonly escrito: Escrito;
};

export type FormularioDeRecurso = FormularioDePlanificacion & {
  readonly elegibles: OpcionesPorCampo;
};

export type CasosUsoPlanificacion = {
  ver(servicioId: string): Promise<DetalleDePlanificacion>;
  formularioDePlanificacion(
    servicioId: string,
  ): Promise<FormularioDePlanificacion>;
  guardarPlanificacion(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
  ): Promise<Resultado>;
  crearHito(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
  ): Promise<Resultado>;
  guardarHito(actor: Actor, id: string, escrito: Escrito): Promise<Resultado>;
  marcarEliminadoHito(actor: Actor, id: string): Promise<void>;
  /** Tilda el hito (con la fecha de hoy y quien lo tilda) o lo destilda. */
  cambiarRealizadoDeHito(
    actor: Actor,
    id: string,
    realizado: boolean,
  ): Promise<void>;
  /** El formulario de alta o, con `id`, el de edición de ese recurso. */
  formularioDeRecurso(id?: string): Promise<FormularioDeRecurso>;
  crearRecurso(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
  ): Promise<Resultado>;
  guardarRecurso(
    actor: Actor,
    id: string,
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
  ["desde", { tipo: "fecha", etiqueta: "Desde", opcional: true }],
  ["hasta", { tipo: "fecha", etiqueta: "Hasta", opcional: true }],
];

type CamposDeRecurso = Omit<DatosRecurso, "servicioId">;

const VALIDACION_DE_RECURSO: z.ZodType<CamposDeRecurso> = z
  .object({
    tipo: z.string(),
    camionId: z.string().nullable(),
    descripcion: opcional(200),
    desde: z.string().nullable(),
    hasta: z.string().nullable(),
  })
  .superRefine((recurso, contexto) => {
    const faltaCamion = recurso.tipo === "camion" && recurso.camionId === null;
    const sobraCamion = recurso.tipo !== "camion" && recurso.camionId !== null;
    const faltaDescripcion =
      recurso.tipo !== "camion" && recurso.descripcion === null;
    const sobraDescripcion =
      recurso.tipo === "camion" && recurso.descripcion !== null;
    const errores = [
      [faltaCamion, "camionId", "Elegí el camión."],
      [
        sobraCamion,
        "camionId",
        "Solo un camión lleva camión: elegí «Ninguno».",
      ],
      [faltaDescripcion, "descripcion", "Escribí la descripción."],
      [
        sobraDescripcion,
        "descripcion",
        "Un camión no lleva descripción: dejala vacía.",
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

function camposDePlanificacion(responsablesElegibles: readonly OpcionAbm[]) {
  const campos: CamposAbm = [
    [
      "responsableId",
      {
        tipo: "opcion",
        etiqueta: "Responsable",
        opciones: responsablesElegibles,
      },
    ],
    [
      "fechaInicioEstimada",
      { tipo: "fecha", etiqueta: "Fecha estimada de inicio", opcional: true },
    ],
  ];
  return campos;
}

const VALIDACION_DE_PLANIFICACION = z.object({
  responsableId: z.string(),
  fechaInicioEstimada: z.string().nullable(),
});

/** El registro con ese id; `DOM-0009` si no existe o ya está dado de baja. */
async function vigentePorId<D>(
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

export function crearCasosUsoPlanificacion({
  transaccional,
  reloj,
  generadorId,
}: Dependencias): CasosUsoPlanificacion {
  /** Rol, servicio tomado y etapa: lo que toda escritura exige antes de mirar lo escrito. */
  async function prepararEscritura(
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
    const servicio = await servicioVigenteBloqueado(repos, servicioId);
    await exigirEtapa(repos, servicioId, carga);
    return servicio;
  }

  const hoy = () => formatearISO(reloj.ahora()).slice(0, 10);

  return {
    ver(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        const { valor } = await servicioVigente(repos, servicioId);
        const estado = cicloServicio.estadoActual(
          await historialDe(repos, servicioId),
        );
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
          responsable: quien({
            tipo: "persona",
            usuarioId: identificadorDesde<"Usuario">(valor.responsableId),
          }),
          fechaInicioEstimada:
            valor.fechaInicioEstimada === null
              ? ""
              : diaConBarras(valor.fechaInicioEstimada),
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
            desde: recurso.desde === null ? "" : diaConBarras(recurso.desde),
            hasta: recurso.hasta === null ? "" : diaConBarras(recurso.hasta),
          })),
          planificable: admiteCarga(estado, "planificacion"),
          tildable: admiteCarga(estado, "tildarHito"),
        };
      });
    },

    formularioDePlanificacion(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        const { valor } = await servicioVigente(repos, servicioId);
        return {
          campos: camposDePlanificacion(
            await responsables(repos, valor.responsableId),
          ),
          escrito: {
            responsableId: valor.responsableId,
            fechaInicioEstimada: valor.fechaInicioEstimada ?? "",
          },
        };
      });
    },

    guardarPlanificacion(actor, servicioId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await prepararEscritura(
          repos,
          actor,
          servicioId,
          "planificacion",
        );
        const validado = validarEscrito(
          camposDePlanificacion(
            await responsables(repos, actual.valor.responsableId),
          ),
          VALIDACION_DE_PLANIFICACION,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        const cambiado = marcarActualizado(
          actual,
          { ...actual.valor, ...validado.datos },
          actor,
          reloj,
        );
        if (!cambiado.ok) {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Servicio",
            id: servicioId,
          });
        }
        await repos.servicios.actualizar(actor, cambiado.valor, "actualizar");
        return { ok: true };
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
        const ultimo = (await repos.hitos.listarDe(servicioId)).at(-1);
        await repos.hitos.crear(
          actor,
          crearAuditable(
            {
              ...validado.datos,
              servicioId,
              orden: (ultimo?.valor.orden ?? 0) + 1,
              realizadoEn: null,
              realizadoPor: null,
              id: identificadorDesde<string>(generadorId.generar()),
            },
            actor,
            reloj,
          ),
        );
        return { ok: true };
      });
    },

    guardarHito(actor, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(
          (clave) => repos.hitos.buscarPorId(clave),
          "Hito",
          id,
        );
        await prepararEscritura(
          repos,
          actor,
          actual.valor.servicioId,
          "planificacion",
        );
        const validado = validarEscrito(
          CAMPOS_DE_HITO,
          VALIDACION_DE_HITO,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        const cambiado = marcarActualizado(
          actual,
          { ...actual.valor, ...validado.datos },
          actor,
          reloj,
        );
        if (!cambiado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Hito", id });
        }
        await repos.hitos.actualizar(actor, cambiado.valor, "actualizar");
        return { ok: true };
      });
    },

    marcarEliminadoHito(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(
          (clave) => repos.hitos.buscarPorId(clave),
          "Hito",
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
          throw nuevoError(catalogo.DOM_0009, { entidad: "Hito", id });
        }
        await repos.hitos.actualizar(actor, eliminado.valor, "eliminar");
      });
    },

    cambiarRealizadoDeHito(actor, id, realizado) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(
          (clave) => repos.hitos.buscarPorId(clave),
          "Hito",
          id,
        );
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
            realizadoEn: realizado ? hoy() : null,
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

    formularioDeRecurso(id) {
      return transaccional.ejecutar(async (repos) => {
        const actual =
          id === undefined
            ? null
            : await vigentePorId(
                (clave) => repos.recursos.buscarPorId(clave),
                "Recurso",
                id,
              );
        const guardado = actual?.valor;
        return {
          campos: CAMPOS_DE_RECURSO,
          elegibles: await elegiblesDe(
            repos,
            CAMPOS_DE_RECURSO,
            guardado ?? {},
          ),
          escrito: {
            tipo: guardado?.tipo ?? "persona",
            camionId: guardado?.camionId ?? "",
            descripcion: guardado?.descripcion ?? "",
            desde: guardado?.desde ?? "",
            hasta: guardado?.hasta ?? "",
          },
        };
      });
    },

    crearRecurso(actor, servicioId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await prepararEscritura(repos, actor, servicioId, "planificacion");
        const leido = await leerRecurso(repos, escrito, {});
        if (!leido.ok) {
          return leido;
        }
        await repos.recursos.crear(
          actor,
          crearAuditable(
            {
              ...leido.datos,
              servicioId,
              id: identificadorDesde<string>(generadorId.generar()),
            },
            actor,
            reloj,
          ),
        );
        return { ok: true };
      });
    },

    guardarRecurso(actor, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(
          (clave) => repos.recursos.buscarPorId(clave),
          "Recurso",
          id,
        );
        await prepararEscritura(
          repos,
          actor,
          actual.valor.servicioId,
          "planificacion",
        );
        const leido = await leerRecurso(repos, escrito, actual.valor);
        if (!leido.ok) {
          return leido;
        }
        const cambiado = marcarActualizado(
          actual,
          { ...actual.valor, ...leido.datos },
          actor,
          reloj,
        );
        if (!cambiado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Recurso", id });
        }
        await repos.recursos.actualizar(actor, cambiado.valor, "actualizar");
        return { ok: true };
      });
    },

    marcarEliminadoRecurso(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await vigentePorId(
          (clave) => repos.recursos.buscarPorId(clave),
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

type RecursoLeido =
  | { readonly ok: true; readonly datos: CamposDeRecurso }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Lo escrito de un recurso, validado contra el formulario y contra los camiones de la base. */
async function leerRecurso(
  repos: RepositoriosEnTransaccion,
  escrito: Escrito,
  previo: Partial<CamposDeRecurso>,
): Promise<RecursoLeido> {
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
    previo,
  );
  return Object.keys(errores).length > 0 ? { ok: false, errores } : validado;
}
