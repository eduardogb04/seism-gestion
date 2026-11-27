/**
 * La modalidad de facturación como tres tarjetas elegibles (F6-04), cada una con
 * su ícono, su texto y, desplegado debajo, lo que esa modalidad necesita:
 * mensual, la cuota y el mes de inicio (con el resumen contra la OC); por
 * hitos, la lista de hitos; puntual, la única factura por el total de la OC.
 * Tocar una tarjeta (`?modalidad=<valor>`) despliega su panel; la elegida lleva
 * el borde del acento y un tilde. Guarda la misma acción de siempre.
 */

import { CalendarDays, Check, Flag, Receipt } from "lucide-react";
import type { ReactNode } from "react";
import {
  ETIQUETAS_DE_MODALIDAD,
  type Facturacion,
  MODALIDADES_DE_FACTURACION,
} from "../../../casos-uso/servicios/facturacion.ts";
import type { ModalidadDeFacturacion } from "../../../dominio/servicios/estados.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import type { EstadoFormulario } from "../../_ui/formulario-abm.tsx";
import { HistorialDeCuota } from "../[id]/facturacion.tsx";
import { cambiarModalidadDeFacturacion } from "../acciones.ts";
import { ConfiguracionMensual, ElegirModalidad } from "./elegir-modalidad.tsx";

const DETALLES: Readonly<Record<ModalidadDeFacturacion, string>> = {
  puntual: "Una sola factura, al terminar el trabajo.",
  por_hitos: "Facturas libres, a medida que se avanza el trabajo.",
  mensual: "Una cuota por mes mientras dure el servicio.",
};

const ICONOS = {
  puntual: Receipt,
  por_hitos: Flag,
  mensual: CalendarDays,
} as const;

const esModalidad = (valor: unknown): valor is ModalidadDeFacturacion =>
  MODALIDADES_DE_FACTURACION.some((propia) => propia === valor);

type Parametros = Readonly<Record<string, string | string[] | undefined>>;

/** La modalidad cuyo panel se despliega: la pedida en la dirección o, si no, la elegida. */
export function modalidadDesplegada(
  { modalidad }: Facturacion,
  parametros: Parametros,
): ModalidadDeFacturacion | null {
  const pedida = parametros.modalidad;
  if (esModalidad(pedida)) {
    return pedida;
  }
  return (
    MODALIDADES_DE_FACTURACION.find(
      (valor) => ETIQUETAS_DE_MODALIDAD[valor] === modalidad,
    ) ?? null
  );
}

/** `dd/mm/aaaa a dd/mm/aaaa` a la fecha final `aaaa-mm-dd`. */
function finDeVigencia(vigencia: string | null): string | null {
  const fin = vigencia?.split(" a ")[1];
  const [dia = "", mes = "", anio = ""] = fin?.split("/") ?? [];
  return anio === "" ? null : `${anio}-${mes}-${dia}`;
}

function PanelDeModalidad({
  servicioId,
  valor,
  facturacion,
  puedeElegir,
  vigencia,
  ordenTotal,
  hitos,
  ruta,
}: {
  readonly servicioId: string;
  readonly valor: ModalidadDeFacturacion;
  readonly facturacion: Facturacion;
  readonly puedeElegir: boolean;
  readonly vigencia: string | null;
  readonly ordenTotal: string | null;
  readonly hitos: ReactNode;
  readonly ruta: string;
}) {
  const accion = cambiarModalidadDeFacturacion.bind(null, servicioId);
  const elegida = facturacion.modalidad === ETIQUETAS_DE_MODALIDAD[valor];
  const hayOtra = facturacion.modalidad !== null && !elegida;
  const cuerpo = (() => {
    if (valor === "mensual") {
      return (
        <MensualDesplegado
          servicioId={servicioId}
          accion={accion}
          elegida={elegida}
          hayOtra={hayOtra}
          facturacion={facturacion}
          puedeElegir={puedeElegir}
          vigencia={vigencia}
          ordenTotal={ordenTotal}
          ruta={ruta}
        />
      );
    }
    if (valor === "por_hitos") {
      return (
        <>
          <p className="mt-0 mb-2 text-[13px] text-texto-2">
            Los hitos son solo avance: las facturas se cargan libres.
          </p>
          {hitos}
          {puedeElegir && !elegida ? (
            <ElegirModalidad
              valor="por_hitos"
              texto="Elegir por hitos"
              accion={accion}
              cambia={hayOtra}
            />
          ) : null}
        </>
      );
    }
    return (
      <>
        <p className="mt-0 mb-0 text-sm text-texto-2">
          Una sola factura por el total de la OC
          {ordenTotal === null ? "" : ` (${ordenTotal})`} al terminar el
          trabajo.
        </p>
        {puedeElegir && !elegida ? (
          <ElegirModalidad
            valor="puntual"
            texto="Elegir puntual"
            accion={accion}
            cambia={hayOtra}
          />
        ) : null}
      </>
    );
  })();
  return (
    <div
      data-panel-de-modalidad={valor}
      className="mt-3 rounded-tarjeta border border-borde bg-superficie-2/40 p-4"
    >
      {cuerpo}
    </div>
  );
}

async function MensualDesplegado({
  servicioId,
  accion,
  elegida,
  hayOtra,
  facturacion,
  puedeElegir,
  vigencia,
  ordenTotal,
  ruta,
}: {
  readonly servicioId: string;
  readonly accion: (
    previo: EstadoFormulario,
    formulario: FormData,
  ) => Promise<EstadoFormulario>;
  readonly elegida: boolean;
  readonly hayOtra: boolean;
  readonly facturacion: Facturacion;
  readonly puedeElegir: boolean;
  readonly vigencia: string | null;
  readonly ordenTotal: string | null;
  readonly ruta: string;
}) {
  if (elegida) {
    const [vigente] = [...facturacion.cuotas].reverse();
    return (
      <>
        <p className="m-0 text-sm text-texto-2">
          Cuota vigente:{" "}
          <strong className="cifras text-texto">
            {vigente?.importe ?? "—"}
          </strong>
          {vigente === undefined ? "" : ` desde ${vigente.desde}`}.
        </p>
        <div className="mt-2">
          <HistorialDeCuota cuotas={facturacion.cuotas} titulo={false} />
        </div>
        {puedeElegir ? (
          <Enlace
            href={`${ruta}?ajusteDeCuota=1`}
            scroll={false}
            className="mt-3 inline-flex text-[13px] font-medium"
          >
            Ajustar cuota
          </Enlace>
        ) : null}
      </>
    );
  }
  const { escrito } =
    await armado().facturacion.formularioDeModalidad(servicioId);
  const moneda = ordenTotal?.slice(0, 3) ?? null;
  return puedeElegir ? (
    <ConfiguracionMensual
      accion={accion}
      moneda={moneda}
      cuotaInicial={escrito.cuota ?? ""}
      desdeInicial={escrito.desde ?? ""}
      vigenciaHasta={finDeVigencia(vigencia)}
      ordenTotal={ordenTotal}
      cambia={hayOtra}
    />
  ) : (
    <p className="m-0 text-sm text-texto-2">
      Una cuota por mes mientras dure el servicio.
    </p>
  );
}

export function TarjetasDeModalidad({
  servicioId,
  facturacion,
  ruta,
  puedeElegir,
  parametros,
  vigencia = null,
  ordenTotal = null,
  hitos = null,
}: {
  readonly servicioId: string;
  readonly facturacion: Facturacion;
  readonly ruta: string;
  readonly puedeElegir: boolean;
  readonly parametros: Parametros;
  /** `dd/mm/aaaa a dd/mm/aaaa`, o `null` si el servicio no tiene vigencia. */
  readonly vigencia?: string | null;
  /** El total de la orden de compra vigente (`ARS 1.000,00`). */
  readonly ordenTotal?: string | null;
  /** La lista de hitos que se muestra en la tarjeta «Por hitos». */
  readonly hitos?: ReactNode;
}) {
  const desplegada = modalidadDesplegada(facturacion, parametros);
  return (
    <>
      <ul
        aria-label="Modalidad de facturación"
        className="m-0 grid list-none gap-3 p-0 @xl/panel:grid-cols-3"
      >
        {MODALIDADES_DE_FACTURACION.map((valor) => {
          const elegida =
            facturacion.modalidad === ETIQUETAS_DE_MODALIDAD[valor];
          const abierta = desplegada === valor;
          const Icono = ICONOS[valor];
          const clases = `relative block h-full rounded-tarjeta border p-4 text-texto ${
            elegida
              ? "border-acento bg-acento-suave/50 ring-1 ring-acento"
              : abierta
                ? "border-borde-fuerte bg-superficie"
                : "border-borde bg-superficie"
          }`;
          const contenido = (
            <>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span
                  aria-hidden="true"
                  className={`grid size-7 place-items-center rounded-md ${elegida ? "bg-acento text-sobre-acento" : "bg-superficie-2 text-texto-2"}`}
                >
                  <Icono className="size-4" />
                </span>
                {ETIQUETAS_DE_MODALIDAD[valor]}
                {elegida ? <span className="sr-only">(elegida)</span> : null}
                {elegida ? (
                  <Check
                    aria-hidden="true"
                    className="ml-auto size-4 text-acento"
                  />
                ) : null}
              </span>
              <span className="mt-2 block text-[13px] text-texto-2">
                {DETALLES[valor]}
              </span>
            </>
          );
          return (
            <li key={valor} data-modalidad-elegida={elegida || undefined}>
              {puedeElegir ? (
                <Enlace
                  href={`${ruta}?modalidad=${valor}`}
                  scroll={false}
                  aria-current={elegida ? "true" : undefined}
                  className={`${clases} presionable no-underline hover:border-borde-fuerte hover:shadow-tarjeta`}
                  data-carga="modalidad"
                >
                  {contenido}
                </Enlace>
              ) : (
                <div className={clases}>{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
      {desplegada === null ? null : (
        <PanelDeModalidad
          servicioId={servicioId}
          valor={desplegada}
          facturacion={facturacion}
          puedeElegir={puedeElegir}
          vigencia={vigencia}
          ordenTotal={ordenTotal}
          hitos={hitos}
          ruta={ruta}
        />
      )}
    </>
  );
}
