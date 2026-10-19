"use client";

/**
 * El aviso de un ajuste de la cuota mensual (F3-03, ADR 0041), al lado de los
 * campos y al día mientras se elige el mes: se lee antes de confirmar. El texto
 * es el de `avisoDeAjuste`; sin JavaScript queda el del mes que vino propuesto.
 */

import { avisoDeAjuste } from "../../../casos-uso/servicios/aviso-de-ajuste.ts";
import { useEscritoEnVivo } from "../../_ui/formulario-abm.tsx";

export function AvisoDeAjuste() {
  const aviso = avisoDeAjuste(useEscritoEnVivo().desde);
  return (
    <p
      aria-live="polite"
      data-aviso-de-ajuste
      className="rounded border border-amber-300 bg-amber-50 p-3"
    >
      {aviso ??
        "Elegí desde qué mes rige: el cambio vale de ese mes en adelante."}
    </p>
  );
}
