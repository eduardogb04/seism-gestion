/**
 * Las facturas de un servicio y sus cobros en una sola lista (FIXES 5, 7 y 8):
 * cada factura es una fila con su comprobante, su vencimiento, su total y su
 * saldo, y se despliega para mostrar sus cobros. Sin tabla ancha ni scroll de
 * costado: bajo 1024 px se esconde «Total con IVA» (queda en el detalle) y en
 * celular cada factura es una tarjeta. HTML del servidor; el despliegue es un
 * `<details>`.
 */

import { Ban, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type {
  CobranzaDeFactura,
  CobroVisible,
} from "../../../casos-uso/servicios/cobros.ts";
import type { FacturaListada } from "../../../casos-uso/servicios/facturas.ts";
import { sumarPorMoneda } from "../../_plata/importes-escritos.ts";
import { ChipVencida } from "../../_plata/piezas.tsx";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { cn } from "../../_ui/cn.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { IconoDeDocumento } from "../../_ui/icono-de-documento.tsx";
import { Importe } from "../_listado/piezas.tsx";
import {
  CambioDelComprobante,
  textoDelEnlaceDeCambio,
} from "./cambio-del-comprobante.tsx";
import { diasHasta } from "./datos-de-panel.ts";

/** Las columnas de la fila: la de «Total con IVA» solo desde 1024 px. */
const COLUMNAS =
  "sm:grid-cols-[1.25rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_10rem] lg:grid-cols-[1.25rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10rem]";

function atrasoDe(vencimiento: string): string {
  const dias = -diasHasta(vencimiento);
  return dias === 1 ? "1 día" : `${dias} días`;
}

function Dato({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-texto-3">{titulo}</dt>
      <dd className="m-0 text-[13px] text-texto-2">{children}</dd>
    </div>
  );
}

function Cobro({
  cobro,
  rutaParaAnular,
}: {
  readonly cobro: CobroVisible;
  readonly rutaParaAnular: string | null;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t border-borde py-2 first:border-t-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="cifras text-[13px] font-medium">
          {cobro.fecha}
          <span className="ml-2 font-normal text-texto-3">
            {cobro.dias === "1" ? "1 día" : `${cobro.dias} días`} desde la
            factura
          </span>
        </span>
        <span className="text-[12px] text-texto-3">
          {cobro.cuenta}
          {cobro.entrada === "" ? null : (
            <>
              {" · entró "}
              <span className="cifras">{cobro.entrada}</span>
            </>
          )}
          {cobro.cambio === "" ? null : (
            <>
              {" · TC "}
              <span className="cifras">{cobro.cambio}</span>
            </>
          )}
          {cobro.ordenPagoNumero === ""
            ? null
            : ` · orden de pago ${cobro.ordenPagoNumero}`}
        </span>
        {cobro.observaciones === "" ? null : (
          <span className="text-[12px] whitespace-pre-line text-texto-3">
            {cobro.observaciones}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="flex flex-col items-end gap-0.5">
          <Importe texto={cobro.importe} />
          {cobro.retencion === "" ? null : (
            <span className="cifras text-[12px] whitespace-nowrap text-texto-3">
              retención {cobro.retencion}
            </span>
          )}
        </span>
        <IconoDeDocumento id={cobro.ordenPagoDocumento?.id} />
        {rutaParaAnular === null ? null : (
          <Enlace
            href={`${rutaParaAnular}?anularCobro=${cobro.id}`}
            scroll={false}
            aria-label="Anular cobro"
            title="Anular cobro"
            className="presionable grid size-8 place-items-center rounded-md text-texto-2 no-underline hover:bg-superficie-3 hover:text-peligro pointer-coarse:size-11"
          >
            <Ban aria-hidden="true" className="size-4" />
          </Enlace>
        )}
      </div>
    </li>
  );
}

function FilaDeFactura({
  factura,
  cobranza,
  ruta,
  puedeFacturar,
  puedeCobrar,
}: {
  readonly factura: FacturaListada;
  readonly cobranza: CobranzaDeFactura | undefined;
  readonly ruta: string;
  readonly puedeFacturar: boolean;
  readonly puedeCobrar: boolean;
}) {
  const cobros = cobranza?.cobros ?? [];
  const saldo = cobranza?.saldo ?? factura.total;
  const conSaldo = cobranza?.cobrada !== true;
  const vencida =
    conSaldo &&
    factura.vencimiento !== "" &&
    diasHasta(factura.vencimiento) < 0;
  const cambioDeTc = puedeFacturar
    ? textoDelEnlaceDeCambio(factura.cambio)
    : null;
  return (
    <li className="rounded-tarjeta border border-borde bg-superficie shadow-tarjeta">
      <details className="group" data-factura={factura.numero}>
        <summary
          className={cn(
            "grid cursor-pointer list-none grid-cols-[1.25rem_minmax(0,1fr)_10rem] items-center gap-x-3 gap-y-1 rounded-tarjeta px-3 py-2.5 hover:bg-superficie-2 sm:py-2 [&::-webkit-details-marker]:hidden",
            COLUMNAS,
          )}
        >
          <ChevronRight
            aria-hidden="true"
            className="row-span-2 size-4 self-start text-texto-3 transition-transform group-open:rotate-90 sm:row-span-1 sm:self-center"
          />
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-[13px] font-medium whitespace-nowrap">
              <Enlace
                href={`/servicios/facturas/${factura.id}`}
                className="relative z-10 text-texto no-underline hover:underline"
              >
                {factura.numero}
              </Enlace>
            </span>
            <span className="text-[12px] text-texto-3">
              {factura.tipo} · <span className="cifras">{factura.fecha}</span>
              {factura.anticipo ? (
                <span className="ml-1.5 rounded bg-superficie-2 px-1.5 text-[11px] text-texto-2">
                  Anticipo
                </span>
              ) : null}
            </span>
          </span>
          <span className="cifras col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] whitespace-nowrap text-texto-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto">
            <span className="sr-only">Vence </span>
            {factura.vencimiento}
            {vencida ? (
              <ChipVencida atraso={atrasoDe(factura.vencimiento)} />
            ) : null}
          </span>
          <span className="hidden text-right lg:block">
            <span className="sr-only">Total con IVA </span>
            <Importe
              texto={factura.total}
              className="[&>span:last-child]:font-normal [&>span:last-child]:text-texto-2"
            />
          </span>
          <span className="col-start-3 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
            <span className="sr-only">Saldo </span>
            <Importe texto={saldo} />
          </span>
          <span className="col-span-2 col-start-2 row-start-3 flex items-center justify-end gap-1 sm:col-span-1 sm:col-start-auto sm:row-start-auto">
            <IconoDeDocumento id={factura.documento?.id} />
            {puedeCobrar && conSaldo ? (
              <Enlace
                href={`${ruta}?cobrar=${factura.id}`}
                scroll={false}
                className={clasesDeBoton(
                  "secundario",
                  "relative z-10 h-8 px-2.5 text-[13px]",
                )}
                data-carga="cobro"
              >
                Cobrar
              </Enlace>
            ) : null}
            {puedeFacturar ? (
              <Enlace
                href={`${ruta}?anularFactura=${factura.id}`}
                scroll={false}
                className={clasesDeBoton(
                  "fantasma",
                  "relative z-10 h-8 px-2.5 text-[13px] text-peligro hover:text-peligro",
                )}
                data-carga="factura"
              >
                Anular
              </Enlace>
            ) : null}
          </span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-borde px-3 py-3 sm:pl-10">
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            <Dato titulo="Total con IVA">
              <Importe
                texto={factura.total}
                className="[&>span:last-child]:font-normal [&>span:last-child]:text-texto-2"
              />
            </Dato>
            <Dato titulo={`Sin IVA · IVA ${factura.alicuota}`}>
              <span className="cifras">
                {factura.sinIva} · {factura.iva}
              </span>
            </Dato>
            {cobranza === undefined ? null : (
              <Dato titulo="Cobrado · retenido">
                <span className="cifras">
                  {cobranza.cobrado} · {cobranza.retenido}
                </span>
              </Dato>
            )}
            {factura.ordenCompra === "" ? null : (
              <Dato titulo="Orden de compra">{factura.ordenCompra}</Dato>
            )}
            {factura.periodo === "" ? null : (
              <Dato titulo="Período">{factura.periodo}</Dato>
            )}
            {factura.cambio === null ? null : (
              <Dato titulo="Tipo de cambio">
                <CambioDelComprobante cambio={factura.cambio} />
                {cambioDeTc === null ? null : (
                  <>
                    {" · "}
                    <Enlace
                      href={`${ruta}?cambioFactura=${factura.id}`}
                      scroll={false}
                      data-carga="factura"
                    >
                      {cambioDeTc}
                    </Enlace>
                  </>
                )}
              </Dato>
            )}
            <Dato titulo="Cargó">{factura.quien}</Dato>
          </dl>
          <div>
            <h3 className="m-0 mb-1 text-[13px] font-semibold">Cobros</h3>
            {cobros.length === 0 ? (
              <p className="m-0 text-[13px] text-texto-3">
                Sin cobros todavía.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {cobros.map((cobro) => (
                  <Cobro
                    key={cobro.id}
                    cobro={cobro}
                    rutaParaAnular={puedeCobrar ? ruta : null}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

export function FacturasYCobros({
  facturas,
  cobranza,
  ruta,
  puedeFacturar,
  puedeCobrar,
}: {
  readonly facturas: readonly FacturaListada[];
  readonly cobranza: readonly CobranzaDeFactura[];
  readonly ruta: string;
  readonly puedeFacturar: boolean;
  readonly puedeCobrar: boolean;
}) {
  const totales = sumarPorMoneda(facturas.map(({ total }) => total));
  const saldos = sumarPorMoneda(
    facturas.map(
      ({ id, total }) =>
        cobranza.find(({ facturaId }) => facturaId === id)?.saldo ?? total,
    ),
  );
  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className={cn(
          "hidden grid-cols-[1.25rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_10rem] gap-x-3 px-3 text-[12px] font-medium text-texto-3 sm:grid",
          COLUMNAS,
        )}
      >
        <span />
        <span>Comprobante</span>
        <span>Vence</span>
        <span className="hidden text-right lg:block">Total con IVA</span>
        <span className="text-right">Saldo</span>
        <span className="text-right">Acciones</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {facturas.map((factura) => (
          <FilaDeFactura
            key={factura.id}
            factura={factura}
            cobranza={cobranza.find(
              ({ facturaId }) => facturaId === factura.id,
            )}
            ruta={ruta}
            puedeFacturar={puedeFacturar}
            puedeCobrar={puedeCobrar}
          />
        ))}
      </ul>
      <dl className="m-0 ml-auto flex flex-col gap-1 text-[13px]">
        <div className="flex items-baseline justify-end gap-3">
          <dt className="text-texto-3">Total con IVA</dt>
          <dd
            className="m-0 flex flex-wrap justify-end gap-x-3"
            data-total-facturado
          >
            {totales.map((total) => (
              <Importe key={total} texto={total} />
            ))}
          </dd>
        </div>
        <div className="flex items-baseline justify-end gap-3">
          <dt className="text-texto-3">Saldo</dt>
          <dd
            className="m-0 flex flex-wrap justify-end gap-x-3"
            data-saldo-facturado
          >
            {saldos.map((saldo) => (
              <Importe key={saldo} texto={saldo} />
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}
