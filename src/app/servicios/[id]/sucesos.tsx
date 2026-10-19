/**
 * La sección *Sucesos* de la pantalla de un servicio (F3-01, ADR 0039): la
 * tabla, con el más nuevo arriba, y la carga (`?suceso=1`) y la anulación con
 * su motivo (`?anularSuceso=<id>`) como ventanas sobre esta misma pantalla.
 */

import {
  CAMPOS_DE_ANULACION,
  type SucesoListado,
} from "../../../casos-uso/servicios/sucesos.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { anularSuceso, registrarSuceso } from "../acciones.ts";

function VentanaDeCarga({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  const { campos, escrito } = armado().sucesos.formulario();
  return (
    <Ventana titulo="Nuevo suceso" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={registrarSuceso.bind(null, servicioId)}
        campos={campos}
        elegibles={{}}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Cargar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

function VentanaDeAnulacion({
  servicioId,
  suceso,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly suceso: SucesoListado | undefined;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Anular suceso" rutaAlCerrar={rutaAlCerrar}>
      {suceso === undefined ? (
        <ErrorEnPantalla error={pantallaDeCodigo("DOM-0009")} />
      ) : (
        <>
          <p className="mb-4">
            Anulás el suceso del {suceso.fecha}: deja de verse, y queda con su
            motivo en la auditoría.
          </p>
          <FormularioAbm
            accion={anularSuceso.bind(null, servicioId, suceso.id)}
            campos={CAMPOS_DE_ANULACION}
            elegibles={{}}
            inicial={{ escrito: {}, errores: {} }}
            enviar={{ texto: "Confirmar anulación", variante: "peligro" }}
            rutaAlCancelar={rutaAlCerrar}
          />
        </>
      )}
    </Ventana>
  );
}

export async function Sucesos({
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const sucesos = await armado().sucesos.listar(servicioId);
  const aAnular = parametros.anularSuceso;
  const cabeceras = ["Fecha", "Qué pasó", "Cargado por"];
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Sucesos</h2>
      {puedeEscribir ? (
        <p className="mb-3">
          <Enlace
            href={`${ruta}?suceso=1`}
            scroll={false}
            className={clasesDeBoton("primario")}
          >
            Nuevo suceso
          </Enlace>
        </p>
      ) : null}
      {sucesos.length === 0 ? (
        <p>Todavía no hay sucesos cargados.</p>
      ) : (
        <Tabla
          cabeceras={puedeEscribir ? [...cabeceras, "Acciones"] : cabeceras}
        >
          {sucesos.map((suceso) => (
            <tr key={suceso.id}>
              <td>{suceso.fecha}</td>
              <td className="whitespace-pre-line">{suceso.texto}</td>
              <td>{suceso.autor}</td>
              {puedeEscribir ? (
                <td>
                  <Enlace
                    href={`${ruta}?anularSuceso=${suceso.id}`}
                    scroll={false}
                  >
                    Anular
                  </Enlace>
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
      )}
      {puedeEscribir && typeof parametros.suceso === "string" ? (
        <VentanaDeCarga servicioId={servicioId} rutaAlCerrar={ruta} />
      ) : null}
      {puedeEscribir && typeof aAnular === "string" ? (
        <VentanaDeAnulacion
          servicioId={servicioId}
          suceso={sucesos.find(({ id }) => id === aAnular)}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </section>
  );
}
