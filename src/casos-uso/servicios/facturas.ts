/**
 * Las facturas de un servicio (F2-06, ADR 0036). Se carga el importe **sin IVA**
 * y la alícuota; el IVA y el total se calculan siempre con el dominio y no se
 * guardan. El cliente sale del servicio. Una factura no se edita; se anula.
 *
 * - Toda escritura recibe el `Actor` primero, exige un rol que escriba
 *   (`AUT-0009`) y corre entera en una transacción: el documento, si hay, y la
 *   cabecera.
 * - El número no se repite entre las vigentes. Facturar más que el saldo de la
 *   orden de compra no se impide: la orden lo avisa (`ordenes-de-compra.ts`).
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
import { esDiaValido, formatearISO } from "../../dominio/compartido/reloj.ts";
import {
  ALICUOTA_POR_DEFECTO,
  ALICUOTAS_IVA,
  ivaDe,
  totalConIva,
} from "../../dominio/servicios/factura.ts";
import type { DatosFactura } from "../../puertos/repositorios/facturas.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import {
  type ErroresPorCampo,
  nombresDeActores,
  validarEscrito,
} from "../abm/abm.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
  nombreDeMoneda,
  type OpcionAbm,
} from "../abm/definicion.ts";
import { obligatorio } from "../abm/validaciones.ts";
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
import { etiquetaDeAlicuota, OPCIONES_DE_ALICUOTA } from "./iva-de-factura.ts";
import { ROLES_QUE_ESCRIBEN_SERVICIOS, servicioVigente } from "./servicios.ts";

const esquemaId = z.uuid();

const MENSAJE_NUMERO_REPETIDO = "Ya hay una factura vigente con ese número.";

type Dependencias = DependenciasDeAdjuntos & {
  readonly transaccional: Transaccional;
};

type ResultadoDeFactura =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Una factura como se ve en la tabla del servicio. */
export type FacturaListada = {
  readonly id: string;
  readonly numero: string;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** dd/mm/aaaa. */
  readonly vencimiento: string;
  /** El número de su orden de compra, o vacío. */
  readonly ordenCompra: string;
  /** Lo que se cargó: `ARS 400,00`. */
  readonly sinIva: string;
  /** `21 %`. */
  readonly alicuota: string;
  /** Calculado, no guardado. */
  readonly iva: string;
  /** Calculado, no guardado: lo que se cobra. */
  readonly total: string;
  readonly documento: DocumentoListado | null;
  /** El email de quien la cargó. */
  readonly quien: string;
};

export type CasosUsoFacturas = {
  /** Las no anuladas, la más nueva primero. */
  listar(servicioId: string): Promise<readonly FacturaListada[]>;
  /** El formulario de la próxima: las órdenes de compra del servicio, el 21 % y la fecha de hoy. */
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
  ): Promise<ResultadoDeFactura>;
  /** La anula (baja lógica, con su documento): su número queda libre. */
  marcarEliminado(actor: Actor, id: string): Promise<void>;
};

/** Lo que se escribe en el formulario: la cabecera sin lo que pone el sistema. */
type DatosEscritos = Omit<DatosFactura, "servicioId" | "documentoId">;

function camposDeFactura(ordenes: readonly OpcionAbm[]): CamposAbm {
  return [
    ["numero", { tipo: "texto", etiqueta: "Número" }],
    ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
    ["vencimiento", { tipo: "fecha", etiqueta: "Vencimiento" }],
    ["importe", { tipo: "importe", etiqueta: "Importe sin IVA" }],
    [
      "alicuota",
      { tipo: "opcion", etiqueta: "IVA", opciones: OPCIONES_DE_ALICUOTA },
    ],
    [
      "ordenCompraId",
      {
        tipo: "opcion",
        etiqueta: "Orden de compra",
        opciones: ordenes,
        opcional: true,
      },
    ],
  ];
}

const VALIDACION: z.ZodType<DatosEscritos> = z
  .object({
    numero: obligatorio("el número", 40),
    fecha: z.string(),
    vencimiento: z.string(),
    importe: importeMayorQueCero,
    alicuota: z.string().transform((valor, contexto) => {
      const alicuota = ALICUOTAS_IVA.find((a) => String(a) === valor);
      if (alicuota === undefined) {
        contexto.addIssue({ code: "custom", message: "Elegí una alícuota." });
        return z.NEVER;
      }
      return alicuota;
    }),
    ordenCompraId: z.string().nullable(),
  })
  .superRefine((datos, contexto) => {
    // Dos días `aaaa-mm-dd` se comparan como texto.
    if (
      esDiaValido(datos.fecha) &&
      esDiaValido(datos.vencimiento) &&
      datos.vencimiento < datos.fecha
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["vencimiento"],
        message: "No puede ser anterior a la fecha de la factura.",
      });
    }
  });

/** Las órdenes de compra vigentes del servicio, para elegir a cuál corresponde la factura. */
async function ordenesParaElegir(
  repos: RepositoriosEnTransaccion,
  servicioId: string,
) {
  return (await repos.ordenesCompra.listarDe(servicioId)).map(({ valor }) => ({
    valor: valor.id,
    etiqueta: `${valor.numero} · ${formatearImporte(valor.importe)}`,
    moneda: valor.importe.moneda,
  }));
}

export function crearCasosUsoFacturas({
  transaccional,
  ...adjuntos
}: Dependencias): CasosUsoFacturas {
  const { reloj, generadorId } = adjuntos;
  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const facturas = await repos.facturas.listarDe(servicioId);
        const ordenes = await repos.ordenesCompra.listarDe(servicioId);
        const documento = await documentosListados(
          repos,
          facturas.map(({ valor }) => valor.documentoId),
        );
        const quien = await nombresDeActores(repos);
        return facturas.map(({ valor, creadoPor }) => ({
          id: valor.id,
          numero: valor.numero,
          fecha: diaConBarras(valor.fecha),
          vencimiento: diaConBarras(valor.vencimiento),
          ordenCompra:
            ordenes.find(({ valor: orden }) => orden.id === valor.ordenCompraId)
              ?.valor.numero ?? "",
          sinIva: formatearImporte(valor.importe),
          alicuota: etiquetaDeAlicuota(valor.alicuota),
          iva: formatearImporte(ivaDe(valor.importe, valor.alicuota)),
          total: formatearImporte(totalConIva(valor.importe, valor.alicuota)),
          documento: documento(valor.documentoId),
          quien: quien(creadoPor),
        }));
      });
    },

    formulario(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const ordenes = await ordenesParaElegir(repos, servicioId);
        const [masNueva] = ordenes;
        return {
          campos: camposDeFactura(ordenes),
          escrito: {
            fecha: formatearISO(reloj.ahora()).slice(0, 10),
            alicuota: String(ALICUOTA_POR_DEFECTO),
            // La factura no hereda la moneda de su orden: se propone la de la última.
            [nombreDeMoneda("importe")]: masNueva?.moneda ?? MONEDAS[0],
          },
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
        const validado = validarEscrito(
          camposDeFactura(await ordenesParaElegir(repos, servicioId)),
          VALIDACION,
          escrito,
        );
        const adjunto = validarAdjuntoOpcional(archivo);
        const repetido =
          validado.ok &&
          (await repos.facturas.existeNumero(validado.datos.numero));
        if (!validado.ok || !adjunto.ok || repetido) {
          return {
            ok: false,
            errores: {
              ...(validado.ok ? {} : validado.errores),
              ...(repetido ? { numero: MENSAJE_NUMERO_REPETIDO } : {}),
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
        await repos.facturas.crear(
          actor,
          crearAuditable(
            { ...validado.datos, servicioId, documentoId, id },
            actor,
            reloj,
          ),
        );
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
          ? await repos.facturas.buscarPorId(id)
          : null;
        const eliminada =
          actual === null ? null : marcarEliminado(actual, actor, reloj);
        if (actual === null || eliminada === null || !eliminada.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Factura", id });
        }
        await repos.facturas.actualizar(actor, eliminada.valor, "eliminar");
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
