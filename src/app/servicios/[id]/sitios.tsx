/** Los sitios de su cliente que abarca el servicio: se marcan y se guardan. */

import type { DetalleDeServicio } from "../../../casos-uso/servicios/servicios.ts";
import { Boton } from "../../_ui/boton.tsx";
import { CasillaSiNo } from "../../_ui/campo-texto.tsx";
import { guardarSitiosDeServicio } from "../acciones.ts";

export function Sitios({
  servicio: { id, sitios },
  puedeEscribir,
}: {
  readonly servicio: DetalleDeServicio;
  readonly puedeEscribir: boolean;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Sitios que abarca</h2>
      {sitios.length === 0 ? (
        <p>Su cliente no tiene sitios cargados.</p>
      ) : (
        <form
          action={guardarSitiosDeServicio.bind(null, id)}
          className="flex flex-col gap-2"
        >
          {sitios.map((sitio) => (
            <CasillaSiNo
              key={sitio.id}
              etiqueta={sitio.nombre}
              name="sitio"
              value={sitio.id}
              defaultChecked={sitio.marcado}
              disabled={!puedeEscribir}
            />
          ))}
          {puedeEscribir ? (
            <div>
              <Boton variante="primario" type="submit">
                Guardar sitios
              </Boton>
            </div>
          ) : null}
        </form>
      )}
    </section>
  );
}
