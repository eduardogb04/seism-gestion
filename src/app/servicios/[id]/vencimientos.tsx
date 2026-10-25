/**
 * La sección *Vencimientos* de la pantalla de un servicio (F4-02): cuándo vence
 * cada cosa del trabajo terminado. En «Finalizado» se agrega uno (`?vencimiento=1`),
 * se corrige la fecha (`?corregir=<id>`) o se descarta con motivo
 * (`?descartar=<id>`), cada uno en una ventana sobre esta misma pantalla; en
 * «Cerrado» se ven y nada más. Cotizar la renovación (F4-07, `?renovar=<id>`) se
 * confirma en una ventana y vale también en «Cerrado».
 */

import {
  CAMPOS_DE_DESCARTE,
  CAMPOS_DE_FECHA,
  CAMPOS_DE_VENCIMIENTO,
  type DetalleDeVencimientos,
} from "../../../casos-uso/servicios/vencimientos.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import {
  cargarVencimiento,
  corregirFechaDeVencimiento,
  cotizarRenovacion,
  descartarVencimiento,
} from "../acciones.ts";

type Fila = DetalleDeVencimientos["vencimientos"][number];

function VentanaDeVencimiento({
  servicioId,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Nuevo vencimiento" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={cargarVencimiento.bind(null, servicioId)}
        campos={CAMPOS_DE_VENCIMIENTO}
        elegibles={{}}
        inicial={{ escrito: {}, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

function VentanaDeCorreccion({
  servicioId,
  fila,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly fila: Fila;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Corregir la fecha" rutaAlCerrar={rutaAlCerrar}>
      <p className="mb-3">{fila.descripcion}</p>
      <FormularioAbm
        accion={corregirFechaDeVencimiento.bind(null, servicioId, fila.id)}
        campos={CAMPOS_DE_FECHA}
        elegibles={{}}
        inicial={{ escrito: { fecha: fila.dia }, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

function VentanaDeDescarte({
  servicioId,
  fila,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly fila: Fila;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Descartar el vencimiento" rutaAlCerrar={rutaAlCerrar}>
      <p className="mb-3">
        {fila.descripcion} · {fila.fecha}
      </p>
      <FormularioAbm
        accion={descartarVencimiento.bind(null, servicioId, fila.id)}
        campos={CAMPOS_DE_DESCARTE}
        elegibles={{}}
        inicial={{ escrito: {}, errores: {} }}
        enviar={{ texto: "Descartar", variante: "peligro" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

function VentanaDeRenovacion({
  servicioId,
  fila,
  rutaAlCerrar,
}: {
  readonly servicioId: string;
  readonly fila: Fila;
  readonly rutaAlCerrar: string;
}) {
  return (
    <Ventana titulo="Cotizar renovación" rutaAlCerrar={rutaAlCerrar}>
      <p className="mb-3">
        {fila.descripcion} · {fila.fecha}
      </p>
      <p className="mb-3">
        Se crea un servicio nuevo en «Creado», con el cliente, el tipo, los
        sitios y los camiones de este.
      </p>
      <form action={cotizarRenovacion.bind(null, servicioId, fila.id)}>
        <Boton variante="primario" type="submit">
          Confirmar
        </Boton>
      </form>
    </Ventana>
  );
}

export async function Vencimientos({
  servicioId,
  ruta,
  puedeEscribir,
  puedeRenovar,
  parametros,
}: {
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly puedeRenovar: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const { vencimientos, editable } =
    await armado().vencimientos.ver(servicioId);
  const puedeCambiar = puedeEscribir && editable;
  const cabeceras = ["Vence el", "Descripción", "Origen", "Estado"];
  const aCorregir = vencimientos.find(
    ({ id, pendiente }) => pendiente && id === parametros.corregir,
  );
  const aDescartar = vencimientos.find(
    ({ id, pendiente }) => pendiente && id === parametros.descartar,
  );
  const aRenovar = vencimientos.find(
    ({ id, pendiente }) => pendiente && id === parametros.renovar,
  );
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Vencimientos</h2>
      {puedeCambiar ? (
        <p className="mb-3">
          <Enlace
            href={`${ruta}?vencimiento=1`}
            scroll={false}
            className={clasesDeBoton("primario")}
          >
            Nuevo vencimiento
          </Enlace>
        </p>
      ) : null}
      {vencimientos.length === 0 ? (
        <p>No hay vencimientos.</p>
      ) : (
        <Tabla
          cabeceras={puedeRenovar ? [...cabeceras, "Acciones"] : cabeceras}
        >
          {vencimientos.map((fila) => (
            <tr key={fila.id} data-vencimiento={fila.descripcion}>
              <td>{fila.fecha}</td>
              <td>{fila.descripcion}</td>
              <td>{fila.origen}</td>
              <td>
                {fila.renovacion === null ? (
                  fila.motivoDeDescarte === null ? (
                    fila.estado
                  ) : (
                    `${fila.estado} · ${fila.motivoDeDescarte}`
                  )
                ) : (
                  <>
                    {fila.estado} ·{" "}
                    <Enlace href={`/servicios/${fila.renovacion.id}`}>
                      {fila.renovacion.codigo}
                    </Enlace>
                  </>
                )}
              </td>
              {puedeRenovar ? (
                <td>
                  {fila.pendiente ? (
                    <span className="flex flex-wrap gap-2">
                      <Enlace
                        href={`${ruta}?renovar=${fila.id}`}
                        scroll={false}
                        className={clasesDeBoton("primario")}
                      >
                        Cotizar renovación
                      </Enlace>
                      {puedeCambiar ? (
                        <>
                          <Enlace
                            href={`${ruta}?corregir=${fila.id}`}
                            scroll={false}
                            className={clasesDeBoton("secundario")}
                          >
                            Corregir fecha
                          </Enlace>
                          <Enlace
                            href={`${ruta}?descartar=${fila.id}`}
                            scroll={false}
                            className={clasesDeBoton("peligro")}
                          >
                            Descartar
                          </Enlace>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
      )}
      {puedeRenovar && aRenovar !== undefined ? (
        <VentanaDeRenovacion
          servicioId={servicioId}
          fila={aRenovar}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeCambiar && parametros.vencimiento === "1" ? (
        <VentanaDeVencimiento servicioId={servicioId} rutaAlCerrar={ruta} />
      ) : null}
      {puedeCambiar && aCorregir !== undefined ? (
        <VentanaDeCorreccion
          servicioId={servicioId}
          fila={aCorregir}
          rutaAlCerrar={ruta}
        />
      ) : null}
      {puedeCambiar && aDescartar !== undefined ? (
        <VentanaDeDescarte
          servicioId={servicioId}
          fila={aDescartar}
          rutaAlCerrar={ruta}
        />
      ) : null}
    </section>
  );
}
