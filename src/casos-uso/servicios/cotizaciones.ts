/**
 * Las cotizaciones de un servicio (F2-05, ADR 0035): la cabecera más el
 * documento, que es el detalle. Una cotización no se edita; se anula.
 *
 * - Toda escritura recibe el `Actor` primero, exige un rol que escriba
 *   (`AUT-0009`) y corre entera en una transacción: el metadato del archivo
 *   (los bytes ya están en el almacén), la cabecera y, si el servicio estaba
 *   «Solicitado», su paso a «Cotizado».
 * - La versión es la mayor del servicio más uno, calculada **dentro** de la
 *   transacción con la fila del servicio tomada: dos altas a la vez se turnan.
 * - El motivo de la revisión se pide desde la segunda.
 * - Lo que la persona corrige (un campo o el archivo) vuelve por campo, no se lanza.
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
import { formatearImporte, MONEDAS } from "../../dominio/compartido/importe.ts";
import { formatearISO } from "../../dominio/compartido/reloj.ts";
import { cicloServicio } from "../../dominio/servicios/estados.ts";
import type { DatosCotizacion } from "../../puertos/repositorios/cotizaciones.ts";
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
import { opcional } from "../abm/validaciones.ts";
import {
  type ArchivoSubido,
  type DependenciasDeAdjuntos,
  marcarDocumentoEliminado,
  registrarDocumento,
  tamanoLegible,
  validarArchivo,
} from "../documentos/documentos.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import {
  historialDe,
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  registrarCambioDeEstado,
  servicioVigente,
} from "./servicios.ts";

const esquemaId = z.uuid();

type Dependencias = DependenciasDeAdjuntos & {
  readonly transaccional: Transaccional;
};

type ResultadoDeCotizacion =
  | { readonly ok: true; readonly id: string; readonly version: number }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Una cotización como se ve en la tabla del servicio. */
export type CotizacionListada = {
  readonly id: string;
  readonly version: number;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** `ARS 12.500,00`. */
  readonly importe: string;
  /** Vacío en la primera. */
  readonly motivo: string;
  readonly documento: {
    readonly id: string;
    readonly nombre: string;
    readonly tamano: string;
  };
  /** El email de quien la cargó. */
  readonly quien: string;
};

export type FormularioDeCotizacion = {
  readonly campos: CamposAbm;
  /** Lo que trae el formulario al abrirse: la fecha de hoy. */
  readonly escrito: Escrito;
};

export type CasosUsoCotizaciones = {
  /** Las no anuladas, la más nueva primero. */
  listar(servicioId: string): Promise<readonly CotizacionListada[]>;
  /** El formulario de la próxima: trae el motivo si ya hubo una. */
  formulario(servicioId: string): Promise<FormularioDeCotizacion>;
  /** `archivo` es `null` si no se eligió ninguno. */
  crear(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
  ): Promise<ResultadoDeCotizacion>;
  /** La anula (baja lógica, con su documento); su versión no se reutiliza. */
  marcarEliminado(actor: Actor, id: string): Promise<void>;
};

function camposDeCotizacion(conMotivo: boolean): CamposAbm {
  return [
    ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
    ["importe", { tipo: "importe", etiqueta: "Importe" }],
    ...(conMotivo
      ? ([
          ["motivo", { tipo: "textoLargo", etiqueta: "Motivo de la revisión" }],
        ] as const)
      : []),
    ["observaciones", { tipo: "textoLargo", etiqueta: "Observaciones" }],
  ];
}

/** Lo que se escribe en el formulario: la cabecera sin lo que pone el sistema. */
type DatosEscritos = Omit<
  DatosCotizacion,
  "servicioId" | "version" | "documentoId"
>;

function validacionDeCotizacion(conMotivo: boolean): z.ZodType<DatosEscritos> {
  const sinMotivo = z.object({
    fecha: z.string(),
    importe: z.object({
      centavos: z.bigint().positive("El importe tiene que ser mayor que cero."),
      moneda: z.enum(MONEDAS),
    }),
    observaciones: opcional(2000),
  });
  return conMotivo
    ? sinMotivo.extend({
        motivo: z
          .string("Escribí el motivo de la revisión.")
          .trim()
          .max(500, "No puede pasar de 500 caracteres."),
      })
    : sinMotivo.transform((datos) => ({ ...datos, motivo: null }));
}

export function crearCasosUsoCotizaciones({
  transaccional,
  ...adjuntos
}: Dependencias): CasosUsoCotizaciones {
  const { reloj, generadorId } = adjuntos;
  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const cotizaciones = await repos.cotizaciones.listarDe(servicioId);
        const documentos = await repos.documentos.buscarPorIds(
          cotizaciones.map(({ valor }) => valor.documentoId),
        );
        const quien = await nombresDeActores(repos);
        return cotizaciones.map(({ valor, creadoPor }) => {
          const documento = documentos.find(
            (candidato) => candidato.valor.id === valor.documentoId,
          )?.valor;
          if (documento === undefined) {
            throw nuevoError(catalogo.INF_0001, {
              motivo: "hay una cotización sin su documento",
              id: valor.id,
            });
          }
          return {
            id: valor.id,
            version: valor.version,
            fecha: diaConBarras(valor.fecha),
            importe: formatearImporte(valor.importe),
            motivo: valor.motivo ?? "",
            documento: {
              id: documento.id,
              nombre: documento.nombre,
              tamano: tamanoLegible(documento.tamano),
            },
            quien: quien(creadoPor),
          };
        });
      });
    },

    formulario(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const hayAnterior =
          (await repos.cotizaciones.ultimaVersion(servicioId)) > 0;
        return {
          campos: camposDeCotizacion(hayAnterior),
          escrito: { fecha: formatearISO(reloj.ahora()).slice(0, 10) },
        };
      });
    },

    crear(actor, servicioId, escrito, archivo) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        await servicioVigente(repos, servicioId);
        const version = await repos.cotizaciones.siguienteVersion(servicioId);
        const conMotivo = version > 1;
        const validado = validarEscrito(
          camposDeCotizacion(conMotivo),
          validacionDeCotizacion(conMotivo),
          escrito,
        );
        const adjunto = validarArchivo(archivo);
        if (!validado.ok || !adjunto.ok) {
          return {
            ok: false,
            errores: {
              ...(validado.ok ? {} : validado.errores),
              ...(adjunto.ok ? {} : { archivo: adjunto.mensaje }),
            },
          };
        }
        const documentoId = await registrarDocumento(
          actor,
          repos,
          adjuntos,
          adjunto.archivo,
        );
        const id = identificadorDesde<string>(generadorId.generar());
        await repos.cotizaciones.crear(
          actor,
          crearAuditable(
            { ...validado.datos, servicioId, version, documentoId, id },
            actor,
            reloj,
          ),
        );
        if (
          cicloServicio.estadoActual(await historialDe(repos, servicioId)) ===
          "solicitado"
        ) {
          await registrarCambioDeEstado(
            actor,
            repos,
            reloj,
            servicioId,
            "cotizado",
            `Cotización v${version} cargada`,
          );
        }
        return { ok: true, id, version };
      });
    },

    marcarEliminado(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const actual = esquemaId.safeParse(id).success
          ? await repos.cotizaciones.buscarPorId(id)
          : null;
        const eliminada =
          actual === null ? null : marcarEliminado(actual, actor, reloj);
        if (actual === null || eliminada === null || !eliminada.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Cotización", id });
        }
        await repos.cotizaciones.actualizar(actor, eliminada.valor, "eliminar");
        await marcarDocumentoEliminado(
          actor,
          repos,
          reloj,
          actual.valor.documentoId,
        );
      });
    },
  };
}
