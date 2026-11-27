"use client";

/**
 * Lo que se toca en el panel desplegado de una modalidad (F6-04): el botón de
 * elegirla (con confirmación si ya había otra) y la cuota mensual con su
 * resumen en vivo. Las dos llaman a la acción de siempre
 * (`cambiarModalidadDeFacturacion`) con `modalidad` en el formulario.
 */

import { useRef, useState } from "react";
import { Boton } from "../../_ui/boton.tsx";
import type { EstadoFormulario } from "../../_ui/formulario-abm.tsx";
import { Confirmar } from "../[id]/_molde/confirmar.tsx";

type Accion = (
  previo: EstadoFormulario,
  formulario: FormData,
) => Promise<EstadoFormulario>;

const VACIO: EstadoFormulario = { escrito: {}, errores: {} };

/** Si salió bien, cierra la ventana en la que está (la de la modalidad). */
function cerrarSiSalio(estado: EstadoFormulario, desde: Element | null): void {
  if (estado.hecho === true) {
    desde?.closest("dialog")?.close();
  }
}

function mensajeDe(estado: EstadoFormulario): string | null {
  const errores = Object.values(estado.errores).flat().filter(Boolean);
  if (errores.length > 0) {
    return errores.join(" ");
  }
  return estado.error === undefined ? null : "No se pudo guardar.";
}

/** `1.500,25` a 1500.25; `NaN` si no se entiende. */
function numeroDe(texto: string): number {
  return Number(
    texto
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
}

const formatear = (numero: number) =>
  numero.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function ElegirModalidad({
  valor,
  texto,
  accion,
  cambia,
}: {
  readonly valor: string;
  readonly texto: string;
  readonly accion: Accion;
  /** Ya había otra modalidad: pide confirmación. */
  readonly cambia: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const enviar = async (formulario: FormData) => {
    formulario.set("modalidad", valor);
    const estado = await accion(VACIO, formulario);
    setError(mensajeDe(estado));
    cerrarSiSalio(estado, raiz.current);
  };
  return (
    <div ref={raiz} className="mt-3 flex flex-wrap items-center gap-3">
      {cambia ? (
        <Confirmar
          titulo={`¿Cambiar la modalidad a ${texto.replace("Elegir ", "")}?`}
          texto="Cambiar la modalidad da de baja las cuotas cargadas."
          textoDeAccion="Cambiar"
          accion={enviar}
        >
          {(abrir) => (
            <Boton variante="primario" type="button" onClick={abrir}>
              {texto}
            </Boton>
          )}
        </Confirmar>
      ) : (
        <form action={enviar}>
          <Boton variante="primario" type="submit">
            {texto}
          </Boton>
        </form>
      )}
      {error === null ? null : (
        <p role="alert" className="m-0 text-xs text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

export function ConfiguracionMensual({
  accion,
  moneda,
  cuotaInicial,
  desdeInicial,
  vigenciaHasta,
  ordenTotal,
  cambia,
}: {
  readonly accion: Accion;
  readonly moneda: string | null;
  readonly cuotaInicial: string;
  readonly desdeInicial: string;
  /** `aaaa-mm-dd` o `null` si el servicio no tiene vigencia. */
  readonly vigenciaHasta: string | null;
  /** `ARS 1.000,00` o `null`. */
  readonly ordenTotal: string | null;
  readonly cambia: boolean;
}) {
  const [cuota, setCuota] = useState(cuotaInicial);
  const [desde, setDesde] = useState(desdeInicial);
  const [error, setError] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const importe = numeroDe(cuota);
  let resumen: string | null = null;
  if (!Number.isNaN(importe) && cuota !== "") {
    resumen = `Cuota ${moneda ?? ""} ${formatear(importe)}`.replace("  ", " ");
    if (vigenciaHasta !== null && desde.length >= 7) {
      const meses =
        (Number(vigenciaHasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 +
        (Number(vigenciaHasta.slice(5, 7)) - Number(desde.slice(5, 7))) +
        1;
      if (meses > 0) {
        resumen =
          `${meses} cuotas · total ${moneda ?? ""} ${formatear(meses * importe)}${ordenTotal === null ? "" : ` contra OC ${ordenTotal}`}`.replace(
            "  ",
            " ",
          );
      }
    }
  }
  const enviar = async (formulario: FormData) => {
    formulario.set("modalidad", "mensual");
    formulario.set("cuota", cuota);
    formulario.set("desde", desde);
    const estado = await accion(VACIO, formulario);
    setError(mensajeDe(estado));
    cerrarSiSalio(estado, raiz.current);
  };
  const campos = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-0.5 text-xs text-texto-3">
        Cuota mensual sin IVA{moneda === null ? "" : ` (${moneda})`}
        <input
          name="cuota"
          value={cuota}
          onChange={(evento) => setCuota(evento.target.value)}
          required
          inputMode="decimal"
          autoComplete="off"
          className="cifras h-8 w-40 rounded-control border border-borde-control bg-superficie px-2 text-sm text-texto pointer-coarse:h-11"
        />
      </label>
      <label className="grid gap-0.5 text-xs text-texto-3">
        Mes de inicio
        <input
          name="desde"
          type="date"
          value={desde}
          onChange={(evento) => setDesde(evento.target.value)}
          required
          className="h-8 rounded-control border border-borde-control bg-superficie px-2 text-sm text-texto pointer-coarse:h-11"
        />
      </label>
    </div>
  );
  return (
    <div ref={raiz} data-configuracion-mensual>
      {cambia ? (
        <Confirmar
          titulo="¿Cambiar la modalidad a Mensual?"
          texto="Cambiar la modalidad da de baja las cuotas cargadas."
          textoDeAccion="Cambiar"
          accion={enviar}
        >
          {(abrir) => (
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                abrir();
              }}
            >
              {campos}
              <div className="mt-3">
                <Boton variante="primario" type="submit">
                  Elegir mensual
                </Boton>
              </div>
            </form>
          )}
        </Confirmar>
      ) : (
        <form action={enviar}>
          {campos}
          <div className="mt-3">
            <Boton variante="primario" type="submit">
              Elegir mensual
            </Boton>
          </div>
        </form>
      )}
      {resumen === null ? null : (
        <p
          data-resumen-mensual
          className="cifras mt-2 mb-0 text-[13px] text-texto-2"
        >
          {resumen}
        </p>
      )}
      {error === null ? null : (
        <p role="alert" className="mt-2 mb-0 text-xs text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}
