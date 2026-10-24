/**
 * *Por cobrar* (F2-07, ADR 0037): las facturas con saldo, por vencimiento, con
 * los días de atraso de la que ya venció y, al pie, lo que queda por cobrar en
 * cada moneda. La fila entera lleva a la factura y cada una ofrece «Registrar
 * cobro» en una ventana sobre este mismo listado (`?cobrar=<id>`, F3-07).
 * HTML del servidor, sin JavaScript de cliente.
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

const RUTA = "/servicios/por-cobrar";

/** Cada cabecera y la columna por la que ordena (`null`: esa no ordena). */
const COLUMNAS = [
  ["Factura", "factura"],
  ["Servicio", "servicio"],
  ["Cliente", "cliente"],
  ["Vencimiento", "vencimiento"],
  ["Total con IVA", null],
  ["Saldo", null],
  ["Atraso", null],
] as const;

/** El listado con su orden y, si se pide, la ventana de cobro abierta. */
function enlace(
  orden: string,
  direccion: "asc" | "desc",
  cobrar?: string,
): string {
  const consulta = new URLSearchParams({ orden, direccion });
  if (cobrar !== undefined) {
    consulta.set("cobrar", cobrar);
  }
  return `${RUTA}?${consulta}`;
}

export default async function PorCobrar({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const { filas, saldos, orden, direccion } =
    await armado().cobros.porCobrar(parametros);
  const { email, rol } = sesion.usuario;
  const puedeEscribir = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const aCobrar =
    typeof parametros.cobrar === "string" ? parametros.cobrar : null;
  const cabeceras = COLUMNAS.map(([texto, columna]) =>
    columna === null
      ? texto
      : cabeceraOrdenable(
          texto,
          columna,
          { orden, direccion },
          (ordenNuevo, direccionNueva) => enlace(ordenNuevo, direccionNueva),
        ),
  );
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main>
        <h1>Por cobrar</h1>
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
              <td>{fila.cliente}</td>
              <td>{fila.vencimiento}</td>
              <td>{fila.total}</td>
              <td>{fila.saldo}</td>
              <td>{fila.atraso}</td>
              {puedeEscribir ? (
                <td className={CLASES_DE_ACCIONES}>
                  <Enlace
                    href={enlace(orden, direccion, fila.facturaId)}
                    scroll={false}
                    className={clasesDeBoton("primario")}
                  >
                    Registrar cobro
                  </Enlace>
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
        <p className="mt-3" data-saldos-por-moneda>
          Saldo por cobrar: {saldos.length === 0 ? "nada" : saldos.join(" · ")}
        </p>
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
