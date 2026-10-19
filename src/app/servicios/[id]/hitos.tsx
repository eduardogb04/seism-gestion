/**
 * La sección *Hitos* de la pantalla de un servicio (F3-02): la lista con su
 * orden. Se arma (`?hito=1`, `?editarHito=<id>`, ventanas sobre esta misma
 * pantalla) en «Adjudicado» y en «En ejecución»; en «En ejecución» cada uno se
 * tilda como realizado o se destilda.
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
import {
  cambiarRealizadoDeHito,
  cargarHito,
  guardarHito,
  quitarHito,
} from "../acciones.ts";

type Hito = DetalleDePlanificacion["hitos"][number];

function VentanaDeHito({
  servicioId,
  hito,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  /** `undefined`: es un hito nuevo. */
  readonly hito: Hito | undefined;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana
      titulo={hito === undefined ? "Nuevo hito" : "Edición de hito"}
      rutaAlCerrar={rutaAlCerrar}
    >
      <FormularioAbm
        accion={
          hito === undefined
            ? cargarHito.bind(null, servicioId)
            : guardarHito.bind(null, servicioId, hito.id)
        }
        campos={CAMPOS_DE_HITO}
        elegibles={{}}
        inicial={{ escrito: { texto: hito?.texto ?? "" }, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

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
  const aEditar = hitos.find(({ id }) => id === parametros.editarHito);
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
                    <>
                      <Enlace
                        href={`${ruta}?editarHito=${hito.id}`}
                        scroll={false}
                      >
                        Editar
                      </Enlace>
                      <form action={quitarHito.bind(null, servicioId, hito.id)}>
                        <Boton variante="peligro" type="submit">
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
        <VentanaDeHito
          servicioId={servicioId}
          hito={undefined}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeArmar && aEditar !== undefined ? (
        <VentanaDeHito
          servicioId={servicioId}
          hito={aEditar}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </section>
  );
}
