/**
 * El registro de sucesos —las situaciones— de un cliente (F3-01, ADR 0039;
 * F4-05, ADR 0044): una entrada con su día, su texto y su autor, que sirve de
 * traza. Cuelga del cliente y, si es de uno, de su servicio. No se edita: se
 * anula, con un motivo. La de un servicio se carga y se anula en cualquier
 * etapa menos «Cerrado» (`DOM-0018`); una suelta no tiene etapa.
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
  marcarEliminado,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import { formatearISO, type Reloj } from "../../dominio/compartido/reloj.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type { Suceso } from "../../puertos/repositorios/sucesos.ts";
import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import {
  type ErroresPorCampo,
  etiquetasDe,
  nombresDeActores,
  validarEscrito,
  vigente,
} from "../abm/abm.ts";
import { CLIENTES } from "../abm/clientes.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
  textosDe,
} from "../abm/definicion.ts";
import { obligatorio } from "../abm/validaciones.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import { exigirEtapa } from "./ciclo.ts";
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

type ResultadoDeSuceso =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

export type SucesoListado = {
  readonly id: string;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  readonly texto: string;
  /** El email de quien lo cargó. */
  readonly autor: string;
};

const ETIQUETAS_DE_TIPO = {
  observacion: "Observación",
  hallazgo: "Hallazgo",
  aclaracion: "Aclaración del cliente",
} as const;

const TIPOS = ["observacion", "hallazgo", "aclaracion"] as const;

const TIPOS_DE_SUCESO = TIPOS.map((valor) => ({
  valor,
  etiqueta: ETIQUETAS_DE_TIPO[valor],
}));

/** Sin tipo (lo cargado antes de F6-01, o sin elegir) es una observación. */
function etiquetaDeTipo(tipo: string | null): string {
  return (
    TIPOS_DE_SUCESO.find(({ valor }) => valor === tipo)?.etiqueta ??
    ETIQUETAS_DE_TIPO.observacion
  );
}

/** Un suceso en la columna del servicio, con la etiqueta de su tipo. */
export type SucesoDelServicio = SucesoListado & { readonly tipo: string };

/** Una situación de la traza de un cliente: la de un servicio lleva el suyo, para enlazarlo. */
export type SituacionListada = SucesoListado & {
  readonly servicio: { readonly id: string; readonly codigo: string } | null;
  /** Por qué se anuló; `null` mientras está vigente (solo las sueltas se ven anuladas). */
  readonly motivoAnulacion: string | null;
};

export type FichaDelCliente = {
  readonly id: string;
  readonly razonSocial: string;
  /** Los datos del cliente, de solo lectura, con su etiqueta. */
  readonly datos: readonly (readonly [string, string])[];
  /** Las suyas y las de todos sus servicios, la más nueva primero. */
  readonly situaciones: readonly SituacionListada[];
};

/** Dónde se carga una situación: siempre de un cliente y, si es de uno, de su servicio. */
export type DestinoDeSuceso = {
  readonly clienteId: string;
  readonly servicioId: string | null;
};

/** Desde dónde se anula: la pantalla de un servicio o la ficha de un cliente (sus sueltas). */
export type OrigenDeAnulacion =
  | { readonly servicioId: string }
  | { readonly clienteId: string };

export type CasosUsoSucesos = {
  /** Los no anulados, el más nuevo primero. */
  listar(servicioId: string): Promise<readonly SucesoDelServicio[]>;
  /** El cliente vigente con sus datos y su traza. `DOM-0009` si no existe o está dado de baja. */
  delCliente(clienteId: string): Promise<FichaDelCliente>;
  /** Los campos de la carga, con la fecha de hoy. */
  formulario(): { readonly campos: CamposAbm; readonly escrito: Escrito };
  /** `DOM-0026` si el cliente no es el del servicio; `DOM-0009` si alguno no existe. */
  crear(
    actor: Actor,
    destino: DestinoDeSuceso,
    escrito: Escrito,
  ): Promise<ResultadoDeSuceso>;
  /**
   * La anulación (baja lógica), con el motivo en `escrito.motivo`. `DOM-0009`
   * si el suceso no existe o no es de ese origen: una suelta no se anula por un
   * servicio ni la de un servicio por la ficha del cliente.
   */
  marcarAnulado(
    actor: Actor,
    origen: OrigenDeAnulacion,
    id: string,
    escrito: Escrito,
  ): Promise<ResultadoDeSuceso>;
};

const CAMPOS: CamposAbm = [
  ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
  ["texto", { tipo: "textoLargo", etiqueta: "Qué pasó" }],
  [
    "tipo",
    {
      tipo: "opcion",
      etiqueta: "Tipo",
      opciones: TIPOS_DE_SUCESO,
      opcional: true,
    },
  ],
];

export const CAMPOS_DE_ANULACION: CamposAbm = [
  ["motivo", { tipo: "textoLargo", etiqueta: "Motivo de la anulación" }],
];

const VALIDACION = z.object({
  fecha: z.string(),
  texto: obligatorio("qué pasó", 2000),
  tipo: z.enum(TIPOS).nullable(),
});

const VALIDACION_DE_ANULACION = z.object({
  motivo: obligatorio("el motivo de la anulación", 500),
});

function listadoDe(
  { valor, creadoPor }: Suceso,
  quien: (actor: Actor) => string,
): SucesoListado {
  return {
    id: valor.id,
    fecha: diaConBarras(valor.fecha),
    texto: valor.texto,
    autor: quien(creadoPor),
  };
}

export function crearCasosUsoSucesos({
  transaccional,
  reloj,
  generadorId,
}: Dependencias): CasosUsoSucesos {
  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const sucesos = await repos.sucesos.listarDe(servicioId);
        const quien = await nombresDeActores(repos);
        return sucesos.map((suceso) => ({
          ...listadoDe(suceso, quien),
          tipo: etiquetaDeTipo(suceso.valor.tipo),
        }));
      });
    },

    delCliente(clienteId) {
      return transaccional.ejecutar(async (repos) => {
        const cliente = await vigente(repos, CLIENTES, clienteId);
        const quien = await nombresDeActores(repos);
        const etiquetas = await etiquetasDe(repos, CLIENTES, [cliente]);
        return {
          id: cliente.valor.id,
          razonSocial: cliente.valor.razonSocial,
          datos: textosDe(CLIENTES, cliente.valor, etiquetas),
          situaciones: (await repos.sucesos.delCliente(clienteId)).map(
            ({ suceso, servicio }) => ({
              ...listadoDe(suceso, quien),
              servicio,
              motivoAnulacion: suceso.valor.motivoAnulacion,
            }),
          ),
        };
      });
    },

    formulario() {
      return {
        campos: CAMPOS,
        escrito: {
          fecha: formatearISO(reloj.ahora()).slice(0, 10),
          tipo: "observacion",
        },
      };
    },

    crear(actor, { clienteId, servicioId }, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        if (servicioId === null) {
          await vigente(repos, CLIENTES, clienteId);
        } else {
          const servicio = await servicioVigenteBloqueado(repos, servicioId);
          if (servicio.valor.clienteId !== clienteId) {
            throw nuevoError(catalogo.DOM_0026, { servicioId, clienteId });
          }
          await exigirEtapa(repos, servicioId, "suceso");
        }
        const validado = validarEscrito(CAMPOS, VALIDACION, escrito);
        if (!validado.ok) {
          return validado;
        }
        await repos.sucesos.crear(
          actor,
          crearAuditable(
            {
              ...validado.datos,
              clienteId,
              servicioId,
              motivoAnulacion: null,
              id: identificadorDesde<string>(generadorId.generar()),
            },
            actor,
            reloj,
          ),
        );
        return { ok: true };
      });
    },

    marcarAnulado(actor, origen, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const actual = esquemaId.safeParse(id).success
          ? await repos.sucesos.buscarPorId(id)
          : null;
        const esDelOrigen =
          actual !== null &&
          ("servicioId" in origen
            ? actual.valor.servicioId === origen.servicioId
            : actual.valor.servicioId === null &&
              actual.valor.clienteId === origen.clienteId);
        if (actual === null || !esDelOrigen) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Suceso", id });
        }
        if (actual.valor.servicioId !== null) {
          await servicioVigenteBloqueado(repos, actual.valor.servicioId);
          await exigirEtapa(repos, actual.valor.servicioId, "suceso");
        }
        const validado = validarEscrito(
          CAMPOS_DE_ANULACION,
          VALIDACION_DE_ANULACION,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        const anulado = marcarEliminado(
          {
            ...actual,
            valor: { ...actual.valor, motivoAnulacion: validado.datos.motivo },
          },
          actor,
          reloj,
        );
        if (!anulado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Suceso", id });
        }
        await repos.sucesos.actualizar(actor, anulado.valor, "eliminar");
        return { ok: true };
      });
    },
  };
}
