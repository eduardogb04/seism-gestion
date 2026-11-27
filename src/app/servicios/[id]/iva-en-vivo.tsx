"use client";

/**
 * El IVA y el total de la factura que se está cargando (F2-06, ADR 0036),
 * debajo del importe y al día mientras se escribe. La alícuota es siempre la
 * misma (21 %): va en un control oculto y la cuenta es la del dominio
 * (`ivaYTotalEscritos`): acá solo se lee lo escrito y se muestra.
 */

import {
  ALICUOTA_DE_FACTURA,
  etiquetaDeAlicuota,
  ivaYTotalEscritos,
} from "../../../casos-uso/servicios/iva-de-factura.ts";
import { useEscritoEnVivo } from "../../_ui/formulario-abm.tsx";

export function IvaEnVivo() {
  const calculo = ivaYTotalEscritos({
    ...useEscritoEnVivo(),
    alicuota: String(ALICUOTA_DE_FACTURA),
  });
  return (
    <>
      <input type="hidden" name="alicuota" value={ALICUOTA_DE_FACTURA} />
      <p aria-live="polite" className="m-0 mt-1.5 text-[13px] text-texto-3">
        {calculo === null ? (
          `IVA ${etiquetaDeAlicuota(ALICUOTA_DE_FACTURA)}`
        ) : (
          <>
            IVA {etiquetaDeAlicuota(ALICUOTA_DE_FACTURA)}:{" "}
            <span data-iva className="cifras">
              {calculo.iva}
            </span>{" "}
            · Total{" "}
            <span data-total-con-iva className="cifras">
              {calculo.total}
            </span>
          </>
        )}
      </p>
    </>
  );
}
