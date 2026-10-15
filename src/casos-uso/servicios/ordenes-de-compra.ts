/**
 * Las órdenes de compra de un servicio (F2-06, ADR 0036): adjudican el servicio
 * y fijan el total contra el que se factura. El importe se carga **sin IVA**; el
 * documento es opcional. Una orden no se edita; se anula, y no se anula una
 * que tiene facturas vigentes.
 *
 * - Toda escritura recibe el `Actor` primero, exige un rol que escriba
 *   (`AUT-0009`) y corre entera en una transacción: el documento, si hay, la
 *   cabecera y, si el servicio pasa a «Adjudicado», ese cambio.
 * - Lo que la persona corrige (un campo o el archivo) vuelve por campo, no se lanza.
 * - El saldo por facturar compara importes sin IVA y puede ser negativo.
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
import {
  crearImporte,
  formatearImporte,
} from "../../dominio/compartido/importe.ts";
import { formatearISO } from "../../dominio/compartido/reloj.ts";
import {
  cicloServicio,
  transicionesDesde,
} from "../../dominio/servicios/estados.ts";
import { saldoDeOrden } from "../../dominio/servicios/orden-compra.ts";
import type { DatosOrdenCompra } from "../../puertos/repositorios/ordenes-de-compra.ts";
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
import { obligatorio, opcional } from "../abm/validaciones.ts";
import type {
  ArchivoSubido,
  DependenciasDeAdjuntos,
} from "../documentos/documentos.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import {
  bajaDeAdjuntoOpcional,
  type DocumentoListado,
  documentosListados,
  guardarAdjuntoOpcional,
  importeMayorQueCero,
  validarAdjuntoOpcional,
} from "./comprobantes.ts";
import {
  historialDe,
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  registrarCambioDeEstado,
  servicioVigente,
  servicioVigenteBloqueado,
} from "./servicios.ts";

const esquemaId = z.uuid();

type Dependencias = DependenciasDeAdjuntos & {
  readonly transaccional: Transaccional;
};

type ResultadoDeOrden =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Una orden de compra como se ve en la tabla del servicio. */
export type OrdenListada = {
  readonly id: string;
  readonly numero: string;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** Sin IVA: `ARS 12.500,00`. */
  readonly total: string;
  /** Las facturas en la moneda de la orden, sin IVA. */
  readonly facturado: string;
  /** El total menos lo facturado; con signo menos si se facturó de más. */
  readonly saldo: string;
  /** Si se facturó de más, cuánto: avisa, no impide. */
  readonly aviso: string | null;
  /** Las facturas en otra moneda, que no suman: `0000-0002 · USD 100,00`. */
  readonly otraMoneda: readonly string[];
  readonly observaciones: string;
  readonly documento: DocumentoListado | null;
  /** El email de quien la cargó. */
  readonly quien: string;
};

export type CasosUsoOrdenesDeCompra = {
  /** Las no anuladas, la más nueva primero, con su saldo. */
  listar(servicioId: string): Promise<readonly OrdenListada[]>;
  /** El formulario de la próxima: trae la fecha de hoy. */
  formulario(servicioId: string): Promise<{
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
  }>;
  /** `archivo` es `null` si no se eligió ninguno: el documento es opcional. */
  crear(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
  ): Promise<ResultadoDeOrden>;
  /** La anula (baja lógica, con su documento). `DOM-0014` si tiene facturas vigentes. */
  marcarEliminado(actor: Actor, id: string): Promise<void>;
};

const CAMPOS: CamposAbm = [
  ["numero", { tipo: "texto", etiqueta: "Número" }],
  ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
  ["importe", { tipo: "importe", etiqueta: "Importe sin IVA" }],
  ["observaciones", { tipo: "textoLargo", etiqueta: "Observaciones" }],
];

/** Lo que se escribe en el formulario: la cabecera sin lo que pone el sistema. */
type DatosEscritos = Omit<DatosOrdenCompra, "servicioId" | "documentoId">;

const VALIDACION: z.ZodType<DatosEscritos> = z.object({
  numero: obligatorio("el número", 40),
  fecha: z.string(),
  importe: importeMayorQueCero,
  observaciones: opcional(2000),
});

export function crearCasosUsoOrdenesDeCompra({
  transaccional,
  ...adjuntos
}: Dependencias): CasosUsoOrdenesDeCompra {
  const { reloj, generadorId } = adjuntos;
  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const ordenes = await repos.ordenesCompra.listarDe(servicioId);
        const deLaFactura = await repos.facturas.listarDe(servicioId);
        const documento = await documentosListados(
          repos,
          ordenes.map(({ valor }) => valor.documentoId),
        );
        const quien = await nombresDeActores(repos);
        return ordenes.map(({ valor, creadoPor }) => {
          const { total, facturado, saldo, otraMoneda } = saldoDeOrden(
            valor.importe,
            deLaFactura
              .filter(
                ({ valor: factura }) => factura.ordenCompraId === valor.id,
              )
              .map(({ valor: { numero, importe } }) => ({ numero, importe })),
          );
          return {
            id: valor.id,
            numero: valor.numero,
            fecha: diaConBarras(valor.fecha),
            total: formatearImporte(total),
            facturado: formatearImporte(facturado),
            saldo: formatearImporte(saldo),
            aviso:
              saldo.centavos < 0n
                ? `Se facturó ${formatearImporte(crearImporte(-saldo.centavos, saldo.moneda))} más que la orden de compra`
                : null,
            otraMoneda: otraMoneda.map(
              (factura) =>
                `${factura.numero} · ${formatearImporte(factura.importe)}`,
            ),
            observaciones: valor.observaciones ?? "",
            documento: documento(valor.documentoId),
            quien: quien(creadoPor),
          };
        });
      });
    },

    formulario(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        return {
          campos: CAMPOS,
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
        const validado = validarEscrito(CAMPOS, VALIDACION, escrito);
        const adjunto = validarAdjuntoOpcional(archivo);
        if (!validado.ok || !adjunto.ok) {
          return {
            ok: false,
            errores: {
              ...(validado.ok ? {} : validado.errores),
              ...(adjunto.ok ? {} : { archivo: adjunto.mensaje }),
            },
          };
        }
        const documentoId = await guardarAdjuntoOpcional(
          actor,
          repos,
          adjuntos,
          adjunto.archivo,
        );
        const id = identificadorDesde<string>(generadorId.generar());
        await repos.ordenesCompra.crear(
          actor,
          crearAuditable(
            { ...validado.datos, servicioId, documentoId, id },
            actor,
            reloj,
          ),
        );
        const estado = cicloServicio.estadoActual(
          await historialDe(repos, servicioId),
        );
        if (transicionesDesde(estado).includes("adjudicado")) {
          await registrarCambioDeEstado(
            actor,
            repos,
            reloj,
            servicioId,
            "adjudicado",
            `Orden de compra ${validado.datos.numero} cargada`,
          );
        }
        return { ok: true, id };
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
          ? await repos.ordenesCompra.buscarPorId(id)
          : null;
        const eliminada =
          actual === null ? null : marcarEliminado(actual, actor, reloj);
        if (actual === null || eliminada === null || !eliminada.ok) {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Orden de compra",
            id,
          });
        }
        // Con la fila del servicio tomada, una factura de esta orden no se carga a la vez.
        await servicioVigenteBloqueado(repos, actual.valor.servicioId);
        const facturas = await repos.facturas.listarDe(actual.valor.servicioId);
        if (facturas.some(({ valor }) => valor.ordenCompraId === id)) {
          throw nuevoError(catalogo.DOM_0014, { id });
        }
        await repos.ordenesCompra.actualizar(
          actor,
          eliminada.valor,
          "eliminar",
        );
        await bajaDeAdjuntoOpcional(
          actor,
          repos,
          reloj,
          actual.valor.documentoId,
        );
      });
    },
  };
}
