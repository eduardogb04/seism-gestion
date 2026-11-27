/**
 * Los hitos de un servicio como checklist (F3-02, F6-02): casilla y nombre, con
 * subir y quitar como íconos, «+ Agregar hito» en línea al final y el selector
 * de plantilla que copia sus hitos. Recibe los datos y las acciones por props,
 * para que el panel de cada etapa la ponga. Se arman y se aplican plantillas en
 * «Adjudicado» y en «En ejecución»; tildar, solo en «En ejecución». La ventana
 * `?hito=1` sigue andando pero ya no se enlaza.
 */

import {
  CAMPOS_DE_HITO,
  type DetalleDePlanificacion,
} from "../../../casos-uso/servicios/planificacion.ts";
import { Boton } from "../../_ui/boton.tsx";
import {
  type EstadoFormulario,
  FormularioAbm,
} from "../../_ui/formulario-abm.tsx";
import { Selector } from "../../_ui/selector.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { AgregarEnLinea } from "../[id]/_molde/fila-editable.tsx";
import { Parte } from "../[id]/_molde/parte.tsx";
import { destildarHitoConMotivo } from "../acciones.ts";
import { FilaDeHito } from "./fila-de-hito.tsx";

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
  enSeccion,
  servicioId,
  clienteId,
  detalle: { hitos, plantillas, planificable, tildable },
  acciones,
  ruta,
  puedeEscribir,
  parametros,
}: {
  /** Dentro de una `Seccion` del molde: sin título propio. */
  readonly enSeccion?: boolean;
  readonly servicioId: string;
  readonly clienteId: string;
  readonly detalle: DetalleDePlanificacion;
  readonly acciones: AccionesDeHitos;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const puedeArmar = puedeEscribir && planificable;
  const puedeTildar = puedeEscribir && tildable;
  return (
    <Parte enSeccion={enSeccion} titulo="Hitos">
      {hitos.length === 0 ? (
        <p className="m-0 text-[13px] text-texto-3">
          Todavía no hay hitos cargados.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {hitos.map((hito, lugar) => (
            <FilaDeHito
              key={hito.id}
              texto={hito.texto}
              realizado={
                hito.realizado === null
                  ? null
                  : `${hito.realizado.fecha} · ${hito.realizado.autor}`
              }
              puedeTildar={puedeTildar}
              tildar={acciones.cambiarRealizado.bind(
                null,
                servicioId,
                hito.id,
                true,
              )}
              destildar={destildarHitoConMotivo.bind(
                null,
                servicioId,
                clienteId,
                hito.id,
                hito.texto,
              )}
              subir={
                puedeArmar && hito.realizado === null && lugar > 0
                  ? acciones.cambiarOrden.bind(
                      null,
                      servicioId,
                      hito.id,
                      "subir",
                    )
                  : null
              }
              quitar={
                puedeArmar && hito.realizado === null
                  ? acciones.quitar.bind(null, servicioId, hito.id)
                  : null
              }
            />
          ))}
        </ul>
      )}
      {puedeArmar ? (
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-[1_1_16rem]">
            <AgregarEnLinea
              texto="Agregar hito"
              campos={[
                {
                  nombre: "texto",
                  etiqueta: "Hito",
                  requerido: true,
                  crece: true,
                },
              ]}
              accion={acciones.cargar.bind(null, servicioId)}
            />
          </div>
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
    </Parte>
  );
}
