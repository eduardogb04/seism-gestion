/**
 * Los hitos de un servicio (F3-02, F6-02): la lista con subir, bajar, quitar y
 * tildar, y el selector de plantilla que copia sus hitos al final. Recibe los
 * datos y las acciones por props, para que el panel de cada etapa la ponga.
 * Se arman (`?hito=1`, una ventana sobre la misma pantalla) y se aplican las
 * plantillas en «Adjudicado» y en «En ejecución»; tildar, solo en «En ejecución».
 */

import {
  CAMPOS_DE_HITO,
  type DetalleDePlanificacion,
} from "../../../casos-uso/servicios/planificacion.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import {
  type EstadoFormulario,
  FormularioAbm,
} from "../../_ui/formulario-abm.tsx";
import { Selector } from "../../_ui/selector.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";

export type AccionesDeHitos = {
  readonly cargar: (
    servicioId: string,
    previo: EstadoFormulario,
    formulario: FormData,
  ) => Promise<EstadoFormulario>;
  readonly quitar: (servicioId: string, id: string) => Promise<void>;
  readonly cambiarRealizado: (
    servicioId: string,
    id: string,
    realizado: boolean,
  ) => Promise<void>;
  readonly cambiarOrden: (
    servicioId: string,
    id: string,
    sentido: "subir" | "bajar",
  ) => Promise<void>;
  /** La plantilla elegida viene en el campo `plantilla` del formulario. */
  readonly aplicarPlantilla: (
    servicioId: string,
    formulario: FormData,
  ) => Promise<void>;
};

export function PlantillaDeHitos({
  servicioId,
  detalle: { hitos, plantillas, planificable, tildable },
  acciones,
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly servicioId: string;
  readonly detalle: DetalleDePlanificacion;
  readonly acciones: AccionesDeHitos;
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
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Enlace
            href={`${ruta}?hito=1`}
            scroll={false}
            className={clasesDeBoton("primario")}
            data-carga="planificacion"
          >
            Nuevo hito
          </Enlace>
          {plantillas.length === 0 ? null : (
            <form
              action={acciones.aplicarPlantilla.bind(null, servicioId)}
              className="flex flex-wrap items-end gap-2"
            >
              <Selector
                etiqueta="Plantilla"
                name="plantilla"
                opciones={plantillas.map(({ id, nombre }) => ({
                  valor: id,
                  texto: nombre,
                }))}
              />
              <Boton
                variante="secundario"
                type="submit"
                data-carga="planificacion"
              >
                Aplicar plantilla
              </Boton>
            </form>
          )}
        </div>
      ) : null}
      {hitos.length === 0 ? (
        <p>Todavía no hay hitos cargados.</p>
      ) : (
        <Tabla
          cabeceras={
            puedeArmar || puedeTildar ? [...cabeceras, "Acciones"] : cabeceras
          }
        >
          {hitos.map((hito, lugar) => (
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
                      action={acciones.cambiarRealizado.bind(
                        null,
                        servicioId,
                        hito.id,
                        hito.realizado === null,
                      )}
                    >
                      <Boton
                        variante="secundario"
                        type="submit"
                        data-carga="tildarHito"
                      >
                        {hito.realizado === null ? "Tildar" : "Destildar"}
                      </Boton>
                    </form>
                  ) : null}
                  {puedeArmar && hito.realizado === null ? (
                    <>
                      {lugar === 0 ? null : (
                        <form
                          action={acciones.cambiarOrden.bind(
                            null,
                            servicioId,
                            hito.id,
                            "subir",
                          )}
                        >
                          <Boton
                            variante="secundario"
                            type="submit"
                            data-carga="planificacion"
                          >
                            Subir
                          </Boton>
                        </form>
                      )}
                      {lugar === hitos.length - 1 ? null : (
                        <form
                          action={acciones.cambiarOrden.bind(
                            null,
                            servicioId,
                            hito.id,
                            "bajar",
                          )}
                        >
                          <Boton
                            variante="secundario"
                            type="submit"
                            data-carga="planificacion"
                          >
                            Bajar
                          </Boton>
                        </form>
                      )}
                      <form
                        action={acciones.quitar.bind(null, servicioId, hito.id)}
                      >
                        <Boton
                          variante="peligro"
                          type="submit"
                          data-carga="planificacion"
                        >
                          Quitar
                        </Boton>
                      </form>
                    </>
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
            accion={acciones.cargar.bind(null, servicioId)}
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
