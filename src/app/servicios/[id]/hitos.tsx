/**
 * La sección *Hitos* de la pantalla de un servicio (F3-02). Se arman
 * (`?hito=1`, una ventana sobre esta misma pantalla) en «Adjudicado» y en «En
 * ejecución»; en «En ejecución» cada uno se tilda como realizado o se destilda.
 */

import {
  CAMPOS_DE_HITO,
  type DetalleDePlanificacion,
} from "../../../casos-uso/servicios/planificacion.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { cambiarRealizadoDeHito, cargarHito, quitarHito } from "../acciones.ts";

export function Hitos({
  servicioId,
  detalle: { hitos, planificable, tildable },
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly servicioId: string;
  readonly detalle: DetalleDePlanificacion;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const puedeArmar = puedeEscribir && planificable;
  const puedeTildar = puedeEscribir && tildable;
  const cabeceras = ["Hito", "Realizado"];
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Hitos</h2>
      {puedeArmar ? (
        <p className="mb-3">
          <Enlace
            href={`${ruta}?hito=1`}
            scroll={false}
            className={clasesDeBoton("primario")}
          >
            Nuevo hito
          </Enlace>
        </p>
      ) : null}
      {hitos.length === 0 ? (
        <p>Todavía no hay hitos cargados.</p>
      ) : (
        <Tabla
          cabeceras={
            puedeArmar || puedeTildar ? [...cabeceras, "Acciones"] : cabeceras
          }
        >
          {hitos.map((hito) => (
            <tr key={hito.id} data-hito={hito.texto}>
              <td>{hito.texto}</td>
              <td data-hito-realizado>
                {hito.realizado === null
                  ? "No"
                  : `${hito.realizado.fecha} · ${hito.realizado.autor}`}
              </td>
              {puedeArmar || puedeTildar ? (
                <td className="flex flex-wrap gap-2">
                  {puedeTildar ? (
                    <form
                      action={cambiarRealizadoDeHito.bind(
                        null,
                        servicioId,
                        hito.id,
                        hito.realizado === null,
                      )}
                    >
                      <Boton variante="secundario" type="submit">
                        {hito.realizado === null ? "Tildar" : "Destildar"}
                      </Boton>
                    </form>
                  ) : null}
                  {puedeArmar ? (
                    <form action={quitarHito.bind(null, servicioId, hito.id)}>
                      <Boton variante="peligro" type="submit">
                        Quitar
                      </Boton>
                    </form>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
      )}
      {puedeArmar && typeof parametros.hito === "string" ? (
        <Ventana titulo="Nuevo hito" rutaAlCerrar={ruta}>
          <FormularioAbm
            accion={cargarHito.bind(null, servicioId)}
            campos={CAMPOS_DE_HITO}
            elegibles={{}}
            inicial={{ escrito: {}, errores: {} }}
            enviar={{ texto: "Guardar", variante: "primario" }}
            rutaAlCancelar={ruta}
          />
        </Ventana>
      ) : null}
    </section>
  );
}
