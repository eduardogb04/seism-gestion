/**
 * Las cuentas de los ajustes de facturación propuestos (R5): lo que queda por
 * facturar de la orden vigente con los descuentos aprobados, cuánto se factura
 * desde cada ajuste y cómo se liga o se desliga su comprobante. Lo usan los
 * casos de uso de ajustes (`ajustes-facturacion.ts`, `ajustes.ts`), el cierre
 * del servicio (`ciclo.ts`) y lo por facturar (`facturacion.ts`).
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import { marcarActualizado } from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  crearImporte,
  type Importe,
  type Moneda,
} from "../../dominio/compartido/importe.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import {
  type AjusteParaCuentas,
  type ClaseDeAjuste,
  descuentosAprobados,
  excesoDeDescuento,
  saldoConDescuentos,
} from "../../dominio/servicios/ajuste-facturacion.ts";
import {
  cuentaParaLaOrden,
  importeConSigno,
} from "../../dominio/servicios/comprobante.ts";
import {
  type SaldoDeOrden,
  saldoDeOrden,
  totalDeOrden,
} from "../../dominio/servicios/orden-compra.ts";
import type { AjusteFacturacion } from "../../puertos/repositorios/ajustes-facturacion.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";
import { comprobanteDe } from "./cobranza.ts";

const esquemaId = z.uuid();

/** Un ajuste con lo que las cuentas necesitan; `null` si está anulado. */
export function paraCuentas({
  valor,
  eliminadoEn,
}: AjusteFacturacion): AjusteParaCuentas | null {
  return eliminadoEn !== undefined
    ? null
    : {
        clase: valor.clase,
        estado: valor.estado,
        importe: valor.importe,
        facturado: valor.facturaId !== null,
      };
}

export type CuentasDeAjustes = {
  /** La orden vigente con sus ampliaciones; `null` si no hay orden. */
  readonly total: Importe<Moneda> | null;
  readonly cuenta: SaldoDeOrden<Moneda, unknown> | null;
  /** Total − descuentos aprobados − facturado; `null` sin orden. */
  readonly saldo: Importe<Moneda> | null;
  /** Los vigentes del servicio, del más nuevo al más viejo. */
  readonly ajustes: readonly AjusteFacturacion[];
  readonly paraCuentas: readonly AjusteParaCuentas[];
};

/** Lo que queda por facturar de la orden vigente de un servicio, con sus descuentos aprobados. */
export async function cuentasDeAjustes(
  repos: RepositoriosEnTransaccion,
  servicioId: string,
): Promise<CuentasDeAjustes> {
  const ajustes = await repos.ajustesFacturacion.listarDe(servicioId);
  const cargados = ajustes.flatMap((ajuste) => paraCuentas(ajuste) ?? []);
  const orden = await repos.ordenesCompra.vigenteDe(servicioId);
  // Sin factura no hay orden de compra: se compara contra la cotización vigente (R8).
  const servicio = await repos.servicios.buscarPorId(servicioId);
  const cotizacion =
    orden === undefined && servicio?.valor.llevaFactura === false
      ? (await repos.cotizaciones.listarDe(servicioId))[0]
      : undefined;
  if (orden === undefined && cotizacion === undefined) {
    return {
      total: null,
      cuenta: null,
      saldo: null,
      ajustes,
      paraCuentas: cargados,
    };
  }
  const ordenId = orden?.valor.id ?? null;
  const base = orden?.valor.importe ?? cotizacion?.valor.importe;
  if (base === undefined) {
    throw new Error("cuentasDeAjustes: sin orden ni cotización");
  }
  const moneda = base.moneda;
  const ampliaciones =
    ordenId === null ? [] : await repos.ampliaciones.listarDe([ordenId]);
  const total = totalDeOrden(
    base,
    ampliaciones.map(({ valor }) => ({
      importe: crearImporte(valor.importeCentavos, moneda),
    })),
  );
  const vigentes = await repos.facturas.listarDe(servicioId);
  const comprobantes = vigentes.map(comprobanteDe);
  const cuenta = saldoDeOrden(
    total,
    vigentes
      .filter(
        (factura) =>
          (factura.valor.ordenCompraId === null ||
            factura.valor.ordenCompraId === ordenId) &&
          cuentaParaLaOrden(comprobanteDe(factura), comprobantes),
      )
      .map(({ valor }) => ({
        importe: importeConSigno(valor.tipo, valor.importe),
      })),
  );
  return {
    total,
    cuenta,
    saldo: saldoConDescuentos(
      total,
      descuentosAprobados(cargados, moneda),
      cuenta.facturado,
    ),
    ajustes,
    paraCuentas: cargados,
  };
}

/**
 * Cuánto se factura desde un ajuste aprobado: el recargo, completo; el
 * descuento, el exceso del saldo que le toca (los descuentos sin nota de
 * crédito se reparten en orden de carga, del más viejo al más nuevo).
 */
export function importeAFacturar(
  cuentas: CuentasDeAjustes,
  ajuste: AjusteFacturacion,
): Importe<Moneda> {
  if (ajuste.valor.clase === "recargo" || cuentas.saldo === null) {
    return ajuste.valor.importe;
  }
  let exceso = excesoDeDescuento(cuentas.saldo).centavos;
  const sinLigar = cuentas.ajustes
    .filter(
      ({ valor }) =>
        valor.clase === "descuento" &&
        valor.estado === "aprobado" &&
        valor.facturaId === null,
    )
    .reverse();
  for (const otro of sinLigar) {
    const tope = otro.valor.importe.centavos;
    // biome-ignore lint/complexity/useMathMinMax: Math.min no admite bigint
    const parte = exceso < tope ? exceso : tope;
    if (otro.valor.id === ajuste.valor.id) {
      return crearImporte(parte, ajuste.valor.importe.moneda);
    }
    exceso -= parte;
  }
  return crearImporte(0n, ajuste.valor.importe.moneda);
}

/** El ajuste vigente (no anulado) con ese id, o `DOM-0009`. */
export async function ajusteVigente(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<AjusteFacturacion> {
  const actual = esquemaId.safeParse(id).success
    ? await repos.ajustesFacturacion.buscarPorId(id)
    : null;
  if (actual === null || actual.eliminadoEn !== undefined) {
    throw nuevoError(catalogo.DOM_0009, { entidad: "Ajuste propuesto", id });
  }
  return actual;
}

/** Liga la factura adicional (de un recargo) o la nota de crédito (de un descuento) con el ajuste aprobado de donde salió. */
export async function ligarAjuste(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  servicioId: string,
  ajusteId: string,
  facturaId: string,
  clase: ClaseDeAjuste,
): Promise<void> {
  const ajuste = await ajusteVigente(repos, ajusteId);
  if (
    ajuste.valor.servicioId !== servicioId ||
    ajuste.valor.clase !== clase ||
    ajuste.valor.estado !== "aprobado" ||
    ajuste.valor.facturaId !== null
  ) {
    throw nuevoError(catalogo.DOM_0009, {
      entidad: "Ajuste propuesto",
      id: ajusteId,
    });
  }
  const ligado = marcarActualizado(
    ajuste,
    { ...ajuste.valor, facturaId },
    actor,
    reloj,
  );
  if (ligado.ok) {
    await repos.ajustesFacturacion.actualizar(
      actor,
      ligado.valor,
      "actualizar",
    );
  }
}

/** Si se anula la factura o la nota que salió de un ajuste, vuelve a estar por facturar. */
export async function desligarAjuste(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  servicioId: string,
  facturaId: string,
): Promise<void> {
  for (const ajuste of await repos.ajustesFacturacion.listarDe(servicioId)) {
    if (ajuste.valor.facturaId !== facturaId) {
      continue;
    }
    const libre = marcarActualizado(
      ajuste,
      { ...ajuste.valor, facturaId: null },
      actor,
      reloj,
    );
    if (libre.ok) {
      await repos.ajustesFacturacion.actualizar(
        actor,
        libre.valor,
        "actualizar",
      );
    }
  }
}
