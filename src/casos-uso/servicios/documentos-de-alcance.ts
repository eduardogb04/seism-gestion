/**
 * Los documentos de alcance de un servicio (F5-01, ADR 0047): archivos que se
 * adjuntan en «Creado» y «Cotizado», antes de que haya una orden. Se agregan y
 * se listan; no se editan. La carga corre entera en una transacción, con la
 * fila del servicio tomada, como la de una cotización.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import { crearAuditable } from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import type { Transaccional } from "../../puertos/repositorios/transaccion.ts";
import type { ErroresPorCampo } from "../abm/abm.ts";
import {
  type ArchivoSubido,
  type DependenciasDeAdjuntos,
  registrarDocumento,
  tamanoLegible,
  validarArchivo,
} from "../documentos/documentos.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import { exigirEtapa } from "./ciclo.ts";
import {
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  servicioVigente,
  servicioVigenteBloqueado,
} from "./servicios.ts";

type Dependencias = DependenciasDeAdjuntos & {
  readonly transaccional: Transaccional;
};

/** Un documento de alcance como se ve en la sección: `id` es el del documento, el que baja. */
export type DocumentoDeAlcanceListado = {
  readonly id: string;
  readonly nombre: string;
  readonly tamano: string;
};

type ResultadoDeCarga =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

export type CasosUsoDocumentosDeAlcance = {
  /** Los del servicio, el más viejo primero. */
  listar(servicioId: string): Promise<readonly DocumentoDeAlcanceListado[]>;
  /** `archivo` es `null` si no se eligió ninguno: vuelve como mensaje del campo. */
  crear(
    actor: Actor,
    servicioId: string,
    archivo: ArchivoSubido | null,
  ): Promise<ResultadoDeCarga>;
};

export function crearCasosUsoDocumentosDeAlcance({
  transaccional,
  ...adjuntos
}: Dependencias): CasosUsoDocumentosDeAlcance {
  const { reloj, generadorId } = adjuntos;
  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const propios = await repos.documentosDeAlcance.listarDe(servicioId);
        const documentos = await repos.documentos.buscarPorIds(
          propios.map(({ valor }) => valor.documentoId),
        );
        return propios.map(({ valor }) => {
          const documento = documentos.find(
            (candidato) => candidato.valor.id === valor.documentoId,
          )?.valor;
          if (documento === undefined) {
            throw nuevoError(catalogo.INF_0001, {
              motivo: "hay un documento de alcance sin su documento",
              id: valor.id,
            });
          }
          return {
            id: documento.id,
            nombre: documento.nombre,
            tamano: tamanoLegible(documento.tamano),
          };
        });
      });
    },

    crear(actor, servicioId, archivo) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        await servicioVigenteBloqueado(repos, servicioId);
        await exigirEtapa(repos, servicioId, "alcance");
        const adjunto = validarArchivo(archivo);
        if (!adjunto.ok) {
          return { ok: false, errores: { archivo: adjunto.mensaje } };
        }
        const documentoId = await registrarDocumento(
          actor,
          repos,
          adjuntos,
          adjunto.archivo,
        );
        await repos.documentosDeAlcance.crear(
          actor,
          crearAuditable(
            {
              id: identificadorDesde<string>(generadorId.generar()),
              servicioId,
              documentoId,
            },
            actor,
            reloj,
          ),
        );
        return { ok: true };
      });
    },
  };
}
