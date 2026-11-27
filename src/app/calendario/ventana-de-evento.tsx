/**
 * El panel de una entrada del calendario (`?evento=<clave>`): el dato completo
 * y la acción que ya existe en el sistema para ese tipo.
 */

import { diaConBarras } from "../../casos-uso/abm/definicion.ts";
import {
  type EntradaDelCalendario,
  ETIQUETAS_DE_TIPO,
} from "../../casos-uso/calendario/calendario.ts";
import { Importe } from "../_plata/piezas.tsx";
import { clasesDeBoton } from "../_ui/boton.tsx";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { Ventana } from "../_ui/ventana.tsx";
import { PUNTO_DE_TIPO } from "./eventos.ts";

function Dato({
  nombre,
  children,
}: {
  readonly nombre: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-texto-3">{nombre}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

export function VentanaDeEvento({
  entrada,
  rutaAlCerrar,
  puedeCobrar,
  puedePagar,
  enlaceDeRenovacion,
}: {
  readonly entrada: EntradaDelCalendario;
  readonly rutaAlCerrar: string;
  readonly puedeCobrar: boolean;
  readonly puedePagar: boolean;
  /** La dirección que abre la renovación de un vencimiento; `null` si quien mira no puede. */
  readonly enlaceDeRenovacion: ((vencimientoId: string) => string) | null;
}) {
  const id = entrada.enlace.split("/").pop() ?? "";
  const [primero = "", ...resto] = entrada.titulo.split(" · ");
  const detalle = resto.join(" · ");
  const renovable = entrada.vencimiento !== null && enlaceDeRenovacion !== null;
  return (
    <Ventana
      titulo={ETIQUETAS_DE_TIPO[entrada.tipo]}
      rutaAlCerrar={rutaAlCerrar}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "mt-2 size-2.5 shrink-0 rounded-full",
              PUNTO_DE_TIPO[entrada.tipo],
            )}
          />
          <p className="m-0 text-lg font-semibold">{entrada.titulo}</p>
        </div>
        <dl className="m-0 flex flex-col gap-4">
          <Dato nombre="Fecha">
            {diaConBarras(entrada.fecha)}
            {entrada.vencida ? (
              <span className="ml-2 font-medium text-peligro">Vencido</span>
            ) : null}
          </Dato>
          {entrada.tipo === "factura" ? (
            <>
              <Dato nombre="Factura">{primero.replace("Factura ", "")}</Dato>
              <Dato nombre="Cliente">{detalle}</Dato>
            </>
          ) : null}
          {entrada.tipo === "vencimiento" ? (
            <>
              <Dato nombre="Qué vence">{primero}</Dato>
              <Dato nombre="Servicio">
                <Enlace href={entrada.enlace}>{detalle}</Enlace>
              </Dato>
            </>
          ) : null}
          {entrada.importe === null ? null : (
            <Dato nombre="Saldo">
              <Importe texto={entrada.importe} />
            </Dato>
          )}
          {entrada.renovacion === null ? null : (
            <Dato nombre="Renovación">
              <Enlace href={`/servicios/${entrada.renovacion.id}`}>
                {entrada.renovacion.codigo}
              </Enlace>
            </Dato>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          {entrada.tipo === "factura" && puedeCobrar ? (
            <Enlace
              href={`${entrada.enlace}?cobrar=${id}`}
              className={clasesDeBoton("primario")}
            >
              Registrar cobro
            </Enlace>
          ) : null}
          {entrada.tipo === "egreso" && puedePagar ? (
            <Enlace
              href={`${entrada.enlace}?pagar=${id}`}
              className={clasesDeBoton("primario")}
            >
              Registrar pago
            </Enlace>
          ) : null}
          {renovable && entrada.vencimiento !== null ? (
            <Enlace
              href={enlaceDeRenovacion(entrada.vencimiento.id)}
              scroll={false}
              className={clasesDeBoton("primario")}
            >
              Cotizar renovación
            </Enlace>
          ) : null}
          <Enlace href={entrada.enlace} className={clasesDeBoton("secundario")}>
            {entrada.tipo === "factura"
              ? "Abrir factura"
              : entrada.tipo === "egreso"
                ? "Abrir egreso"
                : "Abrir servicio"}
          </Enlace>
        </div>
      </div>
    </Ventana>
  );
}
