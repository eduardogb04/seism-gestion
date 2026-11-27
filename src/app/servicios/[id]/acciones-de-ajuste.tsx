"use client";

/**
 * Los íconos de una fila de ajuste propuesto (R5): ✓ aprobar y ✕ rechazar
 * (con motivo obligatorio) para el administrador mientras está pendiente, y
 * anular para quien lo cargó. Todos confirman en el lugar.
 */

import { Check, Trash2, X } from "lucide-react";
import {
  anularAjusteDeFacturacion,
  aprobarAjusteDeFacturacion,
  rechazarAjusteDeFacturacion,
} from "../acciones.ts";
import { Confirmar } from "./_molde/confirmar.tsx";

const ICONO =
  "presionable inline-grid size-8 cursor-pointer place-items-center rounded-md text-texto-2 hover:bg-superficie-3 pointer-coarse:size-11";

export function AccionesDeAjuste({
  servicioId,
  id,
  concepto,
  puedeValidar,
  puedeAnular,
}: {
  readonly servicioId: string;
  readonly id: string;
  readonly concepto: string;
  readonly puedeValidar: boolean;
  readonly puedeAnular: boolean;
}) {
  return (
    <span className="flex items-center gap-0.5">
      {puedeValidar ? (
        <>
          <Confirmar
            titulo={`¿Aprobar «${concepto}»?`}
            texto="Queda aprobado para facturar o descontar."
            textoDeAccion="Aprobar"
            peligro={false}
            accion={aprobarAjusteDeFacturacion.bind(null, servicioId, id)}
          >
            {(abrir) => (
              <button
                type="button"
                onClick={abrir}
                aria-label={`Aprobar ${concepto}`}
                title="Aprobar"
                className={`${ICONO} hover:text-exito`}
              >
                <Check aria-hidden="true" className="size-4" />
              </button>
            )}
          </Confirmar>
          <Confirmar
            titulo={`¿Rechazar «${concepto}»?`}
            textoDeAccion="Rechazar"
            conMotivo
            motivoObligatorio
            accion={rechazarAjusteDeFacturacion.bind(null, servicioId, id)}
          >
            {(abrir) => (
              <button
                type="button"
                onClick={abrir}
                aria-label={`Rechazar ${concepto}`}
                title="Rechazar"
                className={`${ICONO} hover:text-peligro`}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </Confirmar>
        </>
      ) : null}
      {puedeAnular ? (
        <Confirmar
          titulo={`¿Anular «${concepto}»?`}
          textoDeAccion="Anular"
          accion={anularAjusteDeFacturacion.bind(null, servicioId, id)}
        >
          {(abrir) => (
            <button
              type="button"
              onClick={abrir}
              aria-label={`Anular ${concepto}`}
              title="Anular"
              className={`${ICONO} hover:text-peligro`}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          )}
        </Confirmar>
      ) : null}
    </span>
  );
}
