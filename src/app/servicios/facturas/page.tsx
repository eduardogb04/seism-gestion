/**
 * Ingresos: las facturas del mes en una moneda (F2-10), el listado al que lleva
 * *Facturado* del tablero, con el IVA de cada una y el total al pie. La fila
 * entera lleva a la factura y cada una con saldo ofrece «Registrar cobro» en
 * una ventana sobre este mismo listado (`?cobrar=<id>`, F3-07).
 */

import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../../casos-uso/servicios/servicios.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { Marco } from "../../_ui/marco.tsx";
import {
  CLASES_DE_ACCIONES,
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  cabeceraOrdenable,
  Tabla,
} from "../../_ui/tabla.tsx";
import { VentanaDeCobro } from "../../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/servicios/facturas";

/** Cada cabecera y la columna por la que ordena (`null`: esa no ordena). */
const COLUMNAS = [
  ["Factura", "numero"],
  ["Servicio", "servicio"],
  ["Fecha", "fecha"],
  ["Sin IVA", null],
  ["IVA", null],
  ["Total", null],
] as const;

export default async function Ingresos({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const listado = await armado().tablero.listados.facturas(parametros);
  const { email, rol } = sesion.usuario;
  const { mes, moneda, filas, orden, direccion } = listado;
  const puedeEscribir = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const aCobrar =
    typeof parametros.cobrar === "string" ? parametros.cobrar : null;
  /** El listado con su mes, moneda y orden y, si se pide, la ventana de cobro abierta. */
  const enlace = (
    ordenNuevo: string,
    direccionNueva: "asc" | "desc",
    cobrar?: string,
  ) => {
    const consulta = new URLSearchParams({
      mes: mes.mes,
      moneda,
      orden: ordenNuevo,
      direccion: direccionNueva,
    });
    if (cobrar !== undefined) {
      consulta.set("cobrar", cobrar);
    }
    return `${RUTA}?${consulta}`;
  };
  const cabeceras = COLUMNAS.map(([texto, columna]) =>
    columna === null
      ? texto
      : cabeceraOrdenable(texto, columna, { orden, direccion }, enlace),
  );
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main>
        <h1>
          Facturado · {mes.nombre} · {moneda}
        </h1>
        <p>
          <a href={`/?mes=${mes.mes}`}>Volver al inicio</a>
        </p>
        <Tabla
          cabeceras={puedeEscribir ? [...cabeceras, "Acciones"] : cabeceras}
        >
          {filas.map((fila) => (
            <tr key={fila.facturaId} className={CLASES_DE_FILA_ENLAZADA}>
              <td>
                <Enlace
                  href={`/servicios/facturas/${fila.facturaId}`}
                  className={CLASES_DE_ENLACE_DE_FILA}
                >
                  {fila.numero}
                </Enlace>
              </td>
              <td className={CLASES_DE_ACCIONES}>
                <a href={`/servicios/${fila.servicioId}`}>{fila.servicio}</a>
              </td>
              <td>{fila.fecha}</td>
              <td>{fila.sinIva}</td>
              <td>{fila.iva}</td>
              <td>{fila.total}</td>
              {puedeEscribir ? (
                <td className={CLASES_DE_ACCIONES}>
                  {fila.conSaldo ? (
                    <Enlace
                      href={enlace(orden, direccion, fila.facturaId)}
                      scroll={false}
                      className={clasesDeBoton("primario")}
                    >
                      Registrar cobro
                    </Enlace>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
        <p className="mt-3" data-total-sin-iva>
          Sin IVA: {listado.totalSinIva}
        </p>
        <p data-total-iva>IVA: {listado.totalIva}</p>
        <p data-total>Total con IVA: {listado.total}</p>
      </main>
      {puedeEscribir && aCobrar !== null ? (
        <VentanaDeCobro
          facturaId={aCobrar}
          rutaAlCerrar={enlace(orden, direccion)}
        />
      ) : null}
    </Marco>
  );
}
