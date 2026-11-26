/** Los sitios de su cliente que abarca el servicio: se marcan y se guardan. */

import { MapPin } from "lucide-react";
import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import { Boton } from "../../_ui/boton.tsx";
import { guardarSitiosDeServicio } from "../acciones.ts";

export function Sitios({
  servicio: { id, sitios },
  puedeEscribir,
}: {
  readonly servicio: DetalleDeServicio;
  readonly puedeEscribir: boolean;
}) {
  if (sitios.length === 0) {
    return (
      <p className="m-0 text-[13px] text-texto-3">
        Su cliente no tiene sitios cargados.
      </p>
    );
  }
  return (
    <form
      action={guardarSitiosDeServicio.bind(null, id)}
      className="flex flex-col gap-3"
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="sr-only">Sitios que abarca</legend>
        <div className="grid gap-2 @md/panel:grid-cols-2 @3xl/panel:grid-cols-3">
          {sitios.map((sitio) => (
            <label
              key={sitio.id}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border border-borde px-3 py-2 text-[13px] has-checked:border-acento has-checked:bg-acento-suave has-disabled:cursor-default"
            >
              <input
                type="checkbox"
                name="sitio"
                value={sitio.id}
                defaultChecked={sitio.marcado}
                disabled={!puedeEscribir}
                className="size-4 shrink-0 cursor-pointer rounded-[4px] disabled:cursor-default"
              />
              <MapPin aria-hidden="true" className="size-3.5 text-texto-3" />
              <span className="truncate">{sitio.nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {puedeEscribir ? (
        <div>
          <Boton variante="secundario" type="submit">
            Guardar sitios
          </Boton>
        </div>
      ) : null}
    </form>
  );
}
