/**
 * El registro de sucesos de un servicio (F3-01, ADR 0039): una entrada con su
 * día, su texto y su autor, que sirve de traza. No se edita: se anula, con un
 * motivo. Se carga y se anula en cualquier etapa menos «Cerrado» (`DOM-0018`).
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
import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import {
  type ErroresPorCampo,
  nombresDeActores,
  validarEscrito,
} from "../abm/abm.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
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

export type CasosUsoSucesos = {
  /** Los no anulados, el más nuevo primero. */
  listar(servicioId: string): Promise<readonly SucesoListado[]>;
  /** Los campos de la carga, con la fecha de hoy. */
  formulario(): { readonly campos: CamposAbm; readonly escrito: Escrito };
  crear(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
  ): Promise<ResultadoDeSuceso>;
  /** La anulación (baja lógica), con el motivo en `escrito.motivo`. */
  marcarAnulado(
    actor: Actor,
    id: string,
    escrito: Escrito,
  ): Promise<ResultadoDeSuceso>;
};

const CAMPOS: CamposAbm = [
  ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
  ["texto", { tipo: "textoLargo", etiqueta: "Qué pasó" }],
];

export const CAMPOS_DE_ANULACION: CamposAbm = [
  ["motivo", { tipo: "textoLargo", etiqueta: "Motivo de la anulación" }],
];

const VALIDACION = z.object({
  fecha: z.string(),
  texto: obligatorio("qué pasó", 2000),
});

const VALIDACION_DE_ANULACION = z.object({
  motivo: obligatorio("el motivo de la anulación", 500),
});

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
        return sucesos.map(({ valor, creadoPor }) => ({
          id: valor.id,
          fecha: diaConBarras(valor.fecha),
          texto: valor.texto,
          autor: quien(creadoPor),
        }));
      });
    },

    formulario() {
      return {
        campos: CAMPOS,
        escrito: { fecha: formatearISO(reloj.ahora()).slice(0, 10) },
      };
    },

    crear(actor, servicioId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        await servicioVigenteBloqueado(repos, servicioId);
        await exigirEtapa(repos, servicioId, "suceso");
        const validado = validarEscrito(CAMPOS, VALIDACION, escrito);
        if (!validado.ok) {
          return validado;
        }
        await repos.sucesos.crear(
          actor,
          crearAuditable(
            {
              ...validado.datos,
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

    marcarAnulado(actor, id, escrito) {
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
        if (actual === null) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Suceso", id });
        }
        await servicioVigenteBloqueado(repos, actual.valor.servicioId);
        await exigirEtapa(repos, actual.valor.servicioId, "suceso");
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
