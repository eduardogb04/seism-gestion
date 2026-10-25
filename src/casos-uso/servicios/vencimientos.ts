/**
 * Los vencimientos de un servicio terminado (F4-02, ADR 0045). Se
 * corrige la fecha, se carga uno a mano o se descarta uno con motivo, solo en
 * «Finalizado»: en «Cerrado» se ven. Los calculados al finalizar el servicio
 * los genera `generacion-de-vencimientos.ts`.
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
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import { admiteCarga, cicloServicio } from "../../dominio/servicios/estados.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type { RegistroDe } from "../../puertos/repositorios/abm.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import type { DatosVencimiento } from "../../puertos/repositorios/vencimientos.ts";
import { type ErroresPorCampo, validarEscrito } from "../abm/abm.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
} from "../abm/definicion.ts";
import { obligatorio } from "../abm/validaciones.ts";
import { historialDe } from "./ciclo.ts";
import { prepararEscritura, vigentePorId } from "./planificacion.ts";
import { servicioVigente } from "./servicios.ts";

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

type Resultado =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

export type DetalleDeVencimientos = {
  readonly vencimientos: readonly {
    readonly id: string;
    /** dd/mm/aaaa. */
    readonly fecha: string;
    /** aaaa-mm-dd, para el formulario de corrección. */
    readonly dia: string;
    readonly descripcion: string;
    readonly origen: string;
    readonly estado: string;
    /** Solo si está descartado. */
    readonly motivoDeDescarte: string | null;
    readonly pendiente: boolean;
  }[];
  /** ¿La etapa actual admite cargar, corregir y descartar? */
  readonly editable: boolean;
};

export type CasosUsoVencimientos = {
  ver(servicioId: string): Promise<DetalleDeVencimientos>;
  crear(actor: Actor, servicioId: string, escrito: Escrito): Promise<Resultado>;
  cambiarFecha(actor: Actor, id: string, escrito: Escrito): Promise<Resultado>;
  marcarDescartado(
    actor: Actor,
    id: string,
    escrito: Escrito,
  ): Promise<Resultado>;
};

export const CAMPOS_DE_FECHA: CamposAbm = [
  ["fecha", { tipo: "fecha", etiqueta: "Vence el" }],
];

export const CAMPOS_DE_VENCIMIENTO: CamposAbm = [
  ...CAMPOS_DE_FECHA,
  ["descripcion", { tipo: "texto", etiqueta: "Descripción" }],
];

export const CAMPOS_DE_DESCARTE: CamposAbm = [
  ["motivo", { tipo: "texto", etiqueta: "Motivo" }],
];

const VALIDACION_DE_FECHA = z.object({ fecha: z.string() });

const VALIDACION_DE_VENCIMIENTO = VALIDACION_DE_FECHA.extend({
  descripcion: obligatorio("la descripción", 200),
});

const VALIDACION_DE_DESCARTE = z.object({
  motivo: obligatorio("el motivo", 200),
});

const ETIQUETAS_DE_ORIGEN: Readonly<Record<string, string>> = {
  calculado: "Calculado",
  manual: "Manual",
};

const ETIQUETAS_DE_ESTADO: Readonly<Record<string, string>> = {
  pendiente: "Pendiente",
  renovado: "Renovado",
  descartado: "Descartado",
};

export function crearCasosUsoVencimientos({
  transaccional,
  reloj,
  generadorId,
}: Dependencias): CasosUsoVencimientos {
  /** El vencimiento `id` con la escritura preparada; `DOM-0029` si ya no está pendiente. */
  async function pendienteParaEscribir(
    repos: RepositoriosEnTransaccion,
    actor: Actor,
    id: string,
  ): Promise<RegistroDe<DatosVencimiento>> {
    const actual = await vigentePorId(
      repos.vencimientos.buscarPorId,
      "Vencimiento",
      id,
    );
    await prepararEscritura(
      repos,
      actor,
      actual.valor.servicioId,
      "vencimiento",
    );
    if (actual.valor.estado !== "pendiente") {
      throw nuevoError(catalogo.DOM_0029, { id });
    }
    return actual;
  }

  async function guardarCambio(
    actor: Actor,
    repos: RepositoriosEnTransaccion,
    actual: RegistroDe<DatosVencimiento>,
    cambio: Partial<DatosVencimiento>,
  ): Promise<void> {
    const cambiado = marcarActualizado(
      actual,
      { ...actual.valor, ...cambio },
      actor,
      reloj,
    );
    if (!cambiado.ok) {
      throw nuevoError(catalogo.DOM_0009, {
        entidad: "Vencimiento",
        id: actual.valor.id,
      });
    }
    await repos.vencimientos.actualizar(actor, cambiado.valor, "actualizar");
  }

  return {
    ver(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const estado = cicloServicio.estadoActual(
          await historialDe(repos, servicioId),
        );
        return {
          vencimientos: (await repos.vencimientos.listarDe(servicioId)).map(
            ({ valor }) => ({
              id: valor.id,
              fecha: diaConBarras(valor.fecha),
              dia: valor.fecha,
              descripcion: valor.descripcion,
              origen: ETIQUETAS_DE_ORIGEN[valor.origen] ?? valor.origen,
              estado: ETIQUETAS_DE_ESTADO[valor.estado] ?? valor.estado,
              motivoDeDescarte: valor.motivoDescarte,
              pendiente: valor.estado === "pendiente",
            }),
          ),
          editable: admiteCarga(estado, "vencimiento"),
        };
      });
    },

    crear(actor, servicioId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await prepararEscritura(repos, actor, servicioId, "vencimiento");
        const validado = validarEscrito(
          CAMPOS_DE_VENCIMIENTO,
          VALIDACION_DE_VENCIMIENTO,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        await repos.vencimientos.crear(
          actor,
          crearAuditable(
            {
              ...validado.datos,
              id: identificadorDesde<string>(generadorId.generar()),
              servicioId,
              sitioId: null,
              camionId: null,
              origen: "manual",
              estado: "pendiente",
              motivoDescarte: null,
            },
            actor,
            reloj,
          ),
        );
        return { ok: true };
      });
    },

    cambiarFecha(actor, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await pendienteParaEscribir(repos, actor, id);
        const validado = validarEscrito(
          CAMPOS_DE_FECHA,
          VALIDACION_DE_FECHA,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        await guardarCambio(actor, repos, actual, {
          fecha: validado.datos.fecha,
          origen: "manual",
        });
        return { ok: true };
      });
    },

    marcarDescartado(actor, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        const actual = await pendienteParaEscribir(repos, actor, id);
        const validado = validarEscrito(
          CAMPOS_DE_DESCARTE,
          VALIDACION_DE_DESCARTE,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        await guardarCambio(actor, repos, actual, {
          estado: "descartado",
          motivoDescarte: validado.datos.motivo,
        });
        return { ok: true };
      });
    },
  };
}
