"use client";

/**
 * El IVA y el total de la factura que se está cargando (F2-06, ADR 0036), al
 * lado de los campos y al día mientras se escribe el importe o se cambia la
 * alícuota. La cuenta es la del dominio (`ivaYTotalEscritos`): acá solo se lee
 * lo escrito y se muestra. Sin JavaScript queda lo que ya vino escrito; el IVA
 * y el total salen igual en el listado, ya guardada.
 */

import { ivaYTotalEscritos } from "../../../casos-uso/servicios/iva-de-factura.ts";
import { useEscritoEnVivo } from "../../_ui/formulario-abm.tsx";

export function IvaEnVivo() {
  const calculo = ivaYTotalEscritos(useEscritoEnVivo());
  return (
    <dl
      aria-live="polite"
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded border border-gray-200 bg-gray-50 p-3"
    >
      <dt className="font-medium">IVA</dt>
      <dd data-iva>{calculo?.iva ?? "—"}</dd>
      <dt className="font-medium">Total con IVA</dt>
      <dd data-total-con-iva>{calculo?.total ?? "—"}</dd>
    </dl>
  );
}
