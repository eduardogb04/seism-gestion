/**
 * Los recursos de un servicio (F3-02, F6-02), agrupados en *Humanos* (las
 * personas) y *Materiales* (camiones, equipos y materiales). Recibe los datos y
 * las acciones por props, para que el panel de cada etapa la ponga. Se cargan
 * (con «+ Agregar recurso» en línea, al final) y se quitan en
 * «Adjudicado» y en «En ejecución» (`?recurso=1` sigue abriendo la ventana, sin enlazarse); en las demás etapas se ven y nada más.
 */

import type { DetalleDePlanificacion } from "../../../casos-uso/servicios/planificacion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  type EstadoFormulario,
  FormularioAbm,
} from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { AgregarEnLinea } from "../[id]/_molde/fila-editable.tsx";
import { Parte } from "../[id]/_molde/parte.tsx";
import { FilaDeRecurso } from "./fila-de-recurso.tsx";

export type AccionesDeRecursos = {
  readonly cargar: (
    servicioId: string,
    previo: EstadoFormulario,
    formulario: FormData,
  ) => Promise<EstadoFormulario>;
  readonly quitar: (servicioId: string, id: string) => Promise<void>;
};

/** El tipo con el que nace la fila (el valor, no un actor). */
const INICIAL_DE_RECURSO = { ["tipo"]: "persona" };

const GRUPOS = [
  { grupo: "humanos", titulo: "Humanos" },
  { grupo: "materiales", titulo: "Materiales" },
] as const;

async function VentanaDeRecurso({
  servicioId,
  cargar,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly cargar: AccionesDeRecursos["cargar"];
  readonly rutaAlCerrar: string;
}) {
  const { campos, elegibles, escrito } =
    await armado().planificacion.formularioDeRecurso();
  return (
    <Ventana titulo="Nuevo recurso" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={cargar.bind(null, servicioId)}
        campos={campos}
        elegibles={elegibles}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

export async function RecursosAgrupados({
  enSeccion,
  servicioId,
  detalle: { recursos, planificable },
  acciones,
  ruta,
  puedeEscribir,
  parametros,
}: {
  /** Dentro de una `Seccion` del molde: sin título propio. */
  readonly enSeccion?: boolean;
  readonly servicioId: string;
  readonly detalle: DetalleDePlanificacion;
  readonly acciones: AccionesDeRecursos;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const puedeCargar = puedeEscribir && planificable;
  const camiones = puedeCargar
    ? ((await armado().planificacion.formularioDeRecurso()).elegibles
        .camionId ?? [])
    : [];
  return (
    <Parte enSeccion={enSeccion} titulo="Recursos">
      {recursos.length === 0 ? (
        <p className="m-0 text-[13px] text-texto-3">
          Todavía no hay recursos cargados.
        </p>
      ) : (
        GRUPOS.map(({ grupo, titulo }) => {
          const delGrupo = recursos.filter(
            (recurso) => recurso.grupo === grupo,
          );
          return delGrupo.length === 0 ? null : (
            <div key={grupo} data-grupo-de-recursos={grupo} className="mb-3">
              <h4 className="mt-0 mb-0.5 text-xs font-medium tracking-wide text-texto-3 uppercase">
                {titulo}
              </h4>
              <ul className="m-0 list-none p-0">
                {delGrupo.map((recurso) => (
                  <FilaDeRecurso
                    key={recurso.id}
                    titulo={`${recurso.tipo}${recurso.detalle === "" ? "" : ` · ${recurso.detalle}`}`}
                    detalle={[
                      recurso.cantidad === ""
                        ? ""
                        : `Cantidad ${recurso.cantidad}`,
                      recurso.desde === "" && recurso.hasta === ""
                        ? ""
                        : `${recurso.desde || "…"} a ${recurso.hasta || "…"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    quitar={
                      puedeCargar
                        ? acciones.quitar.bind(null, servicioId, recurso.id)
                        : null
                    }
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
      {puedeCargar ? (
        <AgregarEnLinea
          texto="Agregar recurso"
          inicial={INICIAL_DE_RECURSO}
          campos={[
            {
              nombre: "tipo",
              etiqueta: "Tipo",
              tipo: "opcion",
              requerido: true,
              ancho: 7,
              opciones: [
                { valor: "persona", texto: "Persona" },
                { valor: "camion", texto: "Camión" },
                { valor: "equipo", texto: "Equipo" },
                { valor: "material", texto: "Material" },
              ],
            },
            {
              nombre: "camionId",
              etiqueta: "Camión",
              tipo: "opcion",
              requerido: true,
              soloSi: { campo: "tipo", valor: "camion" },
              opciones: camiones,
            },
            {
              nombre: "descripcion",
              etiqueta: "Persona o descripción",
              ancho: 12,
              crece: true,
            },
            { nombre: "cantidad", etiqueta: "Cantidad", ancho: 5 },
            { nombre: "desde", etiqueta: "Desde", tipo: "fecha", ancho: 9 },
            { nombre: "hasta", etiqueta: "Hasta", tipo: "fecha", ancho: 9 },
          ]}
          accion={acciones.cargar.bind(null, servicioId)}
        />
      ) : null}
      {puedeCargar && typeof parametros.recurso === "string" ? (
        <VentanaDeRecurso
          servicioId={servicioId}
          cargar={acciones.cargar}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </Parte>
  );
}
