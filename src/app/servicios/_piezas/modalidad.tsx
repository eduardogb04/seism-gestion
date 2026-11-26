/**
 * La modalidad de facturación como tres tarjetas elegibles (F6-04): la elegida
 * resaltada. Elegir una abre la ventana de siempre (`?modalidad=<valor>`), con
 * la cuota y el mes de inicio si es mensual; guarda la misma acción que antes.
 */

import { CalendarDays, Check, Flag, Receipt } from "lucide-react";
import {
  ETIQUETAS_DE_MODALIDAD,
  type Facturacion,
  MODALIDADES_DE_FACTURACION,
} from "../../../casos-uso/servicios/facturacion.ts";
import type { ModalidadDeFacturacion } from "../../../dominio/servicios/estados.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { cambiarModalidadDeFacturacion } from "../acciones.ts";

const DETALLES: Readonly<Record<ModalidadDeFacturacion, string>> = {
  puntual: "Una sola factura, al terminar el trabajo.",
  por_hitos: "Facturas libres, a medida que se avanza.",
  mensual: "Una cuota por mes mientras dure el servicio.",
};

const ICONOS = {
  puntual: Receipt,
  por_hitos: Flag,
  mensual: CalendarDays,
} as const;

const esModalidad = (valor: unknown): valor is ModalidadDeFacturacion =>
  MODALIDADES_DE_FACTURACION.some((propia) => propia === valor);

async function VentanaDeModalidad({
  servicioId,
  elegida,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly elegida: ModalidadDeFacturacion;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } =
    await armado().facturacion.formularioDeModalidad(servicioId);
  return (
    <Ventana titulo="Modalidad de facturación" rutaAlCerrar={rutaAlCerrar}>
      <p className="mb-4">
        Se puede cambiar mientras el servicio no tenga facturas. Mensual pide la
        cuota sin IVA, en la moneda de la orden de compra, y el mes de inicio.
      </p>
      <FormularioAbm
        accion={cambiarModalidadDeFacturacion.bind(null, servicioId)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito: { ...escrito, modalidad: elegida }, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

export async function TarjetasDeModalidad({
  servicioId,
  facturacion: { modalidad },
  ruta,
  puedeElegir,
  parametros,
}: {
  readonly servicioId: string;
  readonly facturacion: Facturacion;
  readonly ruta: string;
  readonly puedeElegir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const pedida = parametros.modalidad;
  return (
    <>
      <ul
        aria-label="Modalidad de facturación"
        className="m-0 grid list-none gap-3 p-0 @xl/panel:grid-cols-3"
      >
        {MODALIDADES_DE_FACTURACION.map((valor) => {
          const elegida = modalidad === ETIQUETAS_DE_MODALIDAD[valor];
          const Icono = ICONOS[valor];
          const clases = `relative block h-full rounded-tarjeta border p-4 text-texto ${
            elegida
              ? "border-acento bg-acento-suave/50 ring-1 ring-acento"
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
      {puedeElegir && esModalidad(pedida) ? (
        <VentanaDeModalidad
          servicioId={servicioId}
          elegida={pedida}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </>
  );
}
