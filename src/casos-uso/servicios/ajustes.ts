/**
 * Los ajustes de un servicio terminado (F6-03, ADR 0050): la nota de crédito,
 * la nota de débito y la factura adicional, sobre la tabla de facturas. Se
 * cargan y se anulan solo en «Finalizado» (carga `ajuste`, `DOM-0018`); la
 * anulación lleva motivo.
 *
 * - La nota de crédito va siempre contra un comprobante con saldo del servicio,
 *   en su moneda (`DOM-0042`), con su alícuota y sin pasar su saldo pendiente
 *   (`DOM-0043`). La de débito puede ir contra uno o suelta. Las dos heredan la
 *   orden de compra de su asociado, así la orden las cuenta.
 * - La factura adicional no consume la orden de compra: va sin orden.
 * - Después de cargar o anular uno, si todo quedó cobrado el servicio se cierra
 *   en la misma transacción (`cerrarSiEstaCobrado`).
 * - Lo que la persona corrige vuelve por campo, con el código del catálogo.
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
import {
  admiteNotaDeCredito,
  admiteNotaDeDebito,
  importeConSigno,
  type TipoDeComprobante,
} from "../../dominio/servicios/comprobante.ts";
import {
  ALICUOTA_POR_DEFECTO,
  type AlicuotaIva,
  totalConIva,
} from "../../dominio/servicios/factura.ts";
import type {
  DatosFactura,
  Factura,
} from "../../puertos/repositorios/facturas.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import { type ErroresPorCampo, validarEscrito } from "../abm/abm.ts";
import {
  type CampoAbm,
  type CamposAbm,
  diaConBarras,
  type Escrito,
  nombreDeMoneda,
} from "../abm/definicion.ts";
import { cambioDeDocumento, obligatorio } from "../abm/validaciones.ts";
import type {
  ArchivoSubido,
  DependenciasDeAdjuntos,
} from "../documentos/documentos.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import { cerrarSiEstaCobrado, exigirEtapa } from "./ciclo.ts";
import { comprobanteDe, conCobrosDe, totalDe } from "./cobranza.ts";
import {
  bajaDeAdjuntoOpcional,
  CAMPO_DE_CAMBIO,
  guardarAdjuntoOpcional,
  importeMayorQueCero,
  validarAdjuntoOpcional,
} from "./comprobantes.ts";
import {
  alicuotaElegida,
  exigirSinCobrosNiCreditos,
  tipoVisible,
  vencimientoNoAnterior,
} from "./facturas.ts";
import { OPCIONES_DE_ALICUOTA } from "./iva-de-factura.ts";
import {
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  servicioVigenteBloqueado,
} from "./servicios.ts";
import { CAMPOS_DE_ANULACION } from "./sucesos.ts";

export const AJUSTES = ["nota_credito", "nota_debito", "adicional"] as const;

export type Ajuste = (typeof AJUSTES)[number];

type Dependencias = DependenciasDeAdjuntos & {
  readonly transaccional: Transaccional;
};

type ResultadoDeAjuste =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Un ajuste vigente como se ve en la lista del servicio. */
export type AjusteListado = {
  readonly id: string;
  /** `Nota de crédito`, `Nota de débito` o `Factura adicional`. */
  readonly tipo: string;
  readonly numero: string;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** El número del comprobante al que corresponde, o vacío. */
  readonly asociado: string;
  /** Con IVA y con signo: la nota de crédito, en negativo. */
  readonly total: string;
};

export type CasosUsoAjustes = {
  /** Las notas y las facturas adicionales vigentes del servicio, la más nueva primero. */
  listar(servicioId: string): Promise<readonly AjusteListado[]>;
  /** El formulario de un ajuste: los comprobantes con saldo para asociar, la fecha de hoy y el 21 %. */
  formulario(
    servicioId: string,
    ajuste: Ajuste,
  ): Promise<{ readonly campos: CamposAbm; readonly escrito: Escrito }>;
  /** `archivo` es `null` si no se eligió ninguno: el documento es opcional. */
  crear(
    actor: Actor,
    servicioId: string,
    ajuste: Ajuste,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
  ): Promise<ResultadoDeAjuste>;
  /** La anula con el motivo de `escrito.motivo`. `DOM-0009` si no es un ajuste vigente. */
  marcarAnulado(
    actor: Actor,
    id: string,
    escrito: Escrito,
  ): Promise<ResultadoDeAjuste>;
};

const TIPO_DE_AJUSTE: Readonly<Record<Ajuste, TipoDeComprobante>> = {
  nota_credito: "nota_credito",
  nota_debito: "nota_debito",
  adicional: "factura",
};

const CAMPO_ASOCIADO = "comprobanteAsociadoId";

const esquemaId = z.uuid();

/** Si la fila es una nota o una factura adicional. */
const esAjuste = ({ valor }: Factura) =>
  valor.tipo !== "factura" || valor.adicional;

function camposDe(ajuste: Ajuste, asociables: CampoAbm): CamposAbm {
  return [
    ...(ajuste === "adicional" ? [] : [[CAMPO_ASOCIADO, asociables] as const]),
    ["numero", { tipo: "texto", etiqueta: "Número" }],
    ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
    ...(ajuste === "nota_credito"
      ? []
      : [["vencimiento", { tipo: "fecha", etiqueta: "Vencimiento" }] as const]),
    ["importe", { tipo: "importe", etiqueta: "Importe sin IVA" }],
    CAMPO_DE_CAMBIO,
    // La nota de crédito lleva la alícuota de su comprobante.
    ...(ajuste === "nota_credito"
      ? []
      : [
          [
            "alicuota",
            { tipo: "opcion", etiqueta: "IVA", opciones: OPCIONES_DE_ALICUOTA },
          ] as const,
        ]),
  ];
}

const BASE = {
  numero: obligatorio("el número", 40),
  fecha: z.string(),
  importe: importeMayorQueCero,
  cambio: cambioDeDocumento,
};

type DatosDeAjuste = Pick<
  DatosFactura,
  "numero" | "fecha" | "vencimiento" | "importe" | "cambio"
> & {
  /** `null` en la nota de crédito: lleva la de su comprobante. */
  readonly alicuota: AlicuotaIva | null;
};

const VALIDACION_CON_VENCIMIENTO: z.ZodType<DatosDeAjuste> = z
  .object({ ...BASE, vencimiento: z.string(), alicuota: alicuotaElegida })
  .superRefine(vencimientoNoAnterior);

// La nota de crédito no vence: no se cobra.
const VALIDACION_DE_CREDITO: z.ZodType<DatosDeAjuste> = z
  .object(BASE)
  .transform((datos) => ({
    ...datos,
    vencimiento: datos.fecha,
    alicuota: null,
  }));

const VALIDACION_DE_ANULACION = z.object({
  motivo: obligatorio("el motivo de la anulación", 500),
});

const mensajeDe = (entrada: { codigo: string; descripcion: string }) =>
  `${entrada.codigo} · ${entrada.descripcion}`;

/** Los comprobantes con saldo del servicio, con lo que el dominio necesita para asociarles una nota. */
async function asociablesDe(
  repos: RepositoriosEnTransaccion,
  servicioId: string,
) {
  return (
    await conCobrosDe(repos, await repos.facturas.listarDe(servicioId))
  ).map(({ factura, saldo }) => ({
    comprobante: { ...comprobanteDe(factura), total: saldo.total, factura },
    saldo,
  }));
}

function campoAsociado(
  ajuste: Ajuste,
  asociables: Awaited<ReturnType<typeof asociablesDe>>,
): CampoAbm {
  return {
    tipo: "opcion",
    etiqueta: "Comprobante asociado",
    opciones: asociables.map(({ comprobante: { factura }, saldo }) => ({
      valor: factura.valor.id,
      etiqueta: `${tipoVisible(factura.valor)} ${factura.valor.numero} · saldo ${formatearImporte(saldo.saldo)}`,
    })),
    ...(ajuste === "nota_debito" ? { opcional: true as const } : {}),
  };
}

export function crearCasosUsoAjustes({
  transaccional,
  ...adjuntos
}: Dependencias): CasosUsoAjustes {
  const { reloj, generadorId } = adjuntos;

  async function exigirParaEscribir(
    actor: Actor,
    repos: RepositoriosEnTransaccion,
    servicioId: string,
  ): Promise<void> {
    await exigirRol(
      repos.usuarios,
      actor,
      ROLES_QUE_ESCRIBEN_SERVICIOS,
      catalogo.AUT_0009,
    );
    // Con la fila del servicio tomada, el saldo del asociado no cambia mientras se decide.
    await servicioVigenteBloqueado(repos, servicioId);
    await exigirEtapa(repos, servicioId, "ajuste");
  }

  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        const vigentes = await repos.facturas.listarDe(servicioId);
        return vigentes.filter(esAjuste).map((ajuste) => ({
          id: ajuste.valor.id,
          tipo: tipoVisible(ajuste.valor),
          numero: ajuste.valor.numero,
          fecha: diaConBarras(ajuste.valor.fecha),
          asociado:
            vigentes.find(
              ({ valor }) => valor.id === ajuste.valor.comprobanteAsociadoId,
            )?.valor.numero ?? "",
          total: formatearImporte(
            importeConSigno(ajuste.valor.tipo, totalDe(ajuste)),
          ),
        }));
      });
    },

    formulario(servicioId, ajuste) {
      return transaccional.ejecutar(async (repos) => {
        const asociables = await asociablesDe(repos, servicioId);
        const [primero] = asociables;
        return {
          campos: camposDe(ajuste, campoAsociado(ajuste, asociables)),
          escrito: {
            fecha: formatearISO(reloj.ahora()).slice(0, 10),
            alicuota: String(ALICUOTA_POR_DEFECTO),
            [nombreDeMoneda("importe")]:
              primero?.saldo.total.moneda ?? MONEDAS[0],
          },
        };
      });
    },

    crear(actor, servicioId, ajuste, escrito, archivo) {
      return transaccional.ejecutar(async (repos) => {
        await exigirParaEscribir(actor, repos, servicioId);
        const asociables = await asociablesDe(repos, servicioId);
        const campos = camposDe(ajuste, campoAsociado(ajuste, asociables));
        const tipo = TIPO_DE_AJUSTE[ajuste];
        const escritoAsociado = (escrito[CAMPO_ASOCIADO] ?? "").trim();
        const asociadoId =
          ajuste === "adicional" || escritoAsociado === ""
            ? null
            : escritoAsociado;
        const asociado = asociables.find(
          ({ comprobante }) => comprobante.id === asociadoId,
        )?.comprobante.factura;

        const validado = validarEscrito(
          campos,
          ajuste === "nota_credito"
            ? VALIDACION_DE_CREDITO
            : VALIDACION_CON_VENCIMIENTO,
          escrito,
        );
        const adjunto = validarAdjuntoOpcional(archivo);
        const errores: Record<string, string> = validado.ok
          ? {}
          : { ...validado.errores };
        if (!adjunto.ok) {
          errores.archivo = adjunto.mensaje;
        }
        if (ajuste === "nota_credito" && asociadoId === null) {
          errores[CAMPO_ASOCIADO] = "Elegí el comprobante al que corresponde.";
        } else if (validado.ok && ajuste !== "adicional") {
          const { importe } = validado.datos;
          const admitida =
            ajuste === "nota_credito"
              ? admiteNotaDeCredito(
                  asociables,
                  asociadoId ?? "",
                  totalConIva(importe, asociado?.valor.alicuota ?? 0),
                )
              : admiteNotaDeDebito(asociables, asociadoId, importe.moneda);
          if (!admitida.ok) {
            const enImporte =
              admitida.error.codigo === catalogo.DOM_0043.codigo;
            errores[enImporte ? "importe" : CAMPO_ASOCIADO] = enImporte
              ? `${mensajeDe(catalogo.DOM_0043)} Quedan ${formatearImporte(
                  asociables.find(
                    ({ comprobante }) => comprobante.id === asociadoId,
                  )?.saldo.saldo ?? importe,
                )}.`
              : mensajeDe(catalogo.DOM_0042);
          }
        } else if (asociadoId !== null && asociado === undefined) {
          errores[CAMPO_ASOCIADO] = mensajeDe(catalogo.DOM_0042);
        }
        if (
          validado.ok &&
          (await repos.facturas.existeNumero(validado.datos.numero, tipo))
        ) {
          errores.numero = `Ya hay una ${tipoVisible({ tipo, adicional: false }).toLowerCase()} vigente con ese número.`;
        }
        if (!validado.ok || !adjunto.ok || Object.keys(errores).length > 0) {
          return { ok: false, errores };
        }

        const datos = validado.datos;
        const documentoId = await guardarAdjuntoOpcional(
          actor,
          repos,
          adjuntos,
          adjunto.archivo,
        );
        await repos.facturas.crear(
          actor,
          crearAuditable(
            {
              id: identificadorDesde<string>(generadorId.generar()),
              servicioId,
              ordenCompraId: asociado?.valor.ordenCompraId ?? null,
              numero: datos.numero,
              fecha: datos.fecha,
              vencimiento: datos.vencimiento,
              importe: datos.importe,
              cambio: datos.cambio,
              alicuota:
                datos.alicuota ??
                asociado?.valor.alicuota ??
                ALICUOTA_POR_DEFECTO,
              periodo: null,
              documentoId,
              tipo,
              adicional: ajuste === "adicional",
              comprobanteAsociadoId: asociadoId,
              motivoAnulacion: null,
            },
            actor,
            reloj,
          ),
        );
        await cerrarSiEstaCobrado(actor, repos, reloj, servicioId);
        return { ok: true };
      });
    },

    marcarAnulado(actor, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        const actual = esquemaId.safeParse(id).success
          ? await repos.facturas.buscarPorId(id)
          : null;
        if (
          actual === null ||
          actual.eliminadoEn !== undefined ||
          !esAjuste(actual)
        ) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Ajuste", id });
        }
        const { servicioId } = actual.valor;
        await exigirParaEscribir(actor, repos, servicioId);
        const validado = validarEscrito(
          CAMPOS_DE_ANULACION,
          VALIDACION_DE_ANULACION,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        await exigirSinCobrosNiCreditos(repos, actual);
        const anulado = marcarEliminado(
          {
            ...actual,
            valor: { ...actual.valor, motivoAnulacion: validado.datos.motivo },
          },
          actor,
          reloj,
        );
        if (!anulado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Ajuste", id });
        }
        await repos.facturas.actualizar(actor, anulado.valor, "eliminar");
        await bajaDeAdjuntoOpcional(
          actor,
          repos,
          reloj,
          actual.valor.documentoId,
        );
        await cerrarSiEstaCobrado(actor, repos, reloj, servicioId);
        return { ok: true };
      });
    },
  };
}
