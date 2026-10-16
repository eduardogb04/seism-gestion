/**
 * Las facturas del mes en una moneda (F2-10): el listado al que lleva
 * *Facturado* del tablero, con el IVA de cada una y el total al pie.
 */

import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/servicios/facturas";

export default async function FacturasDelMes({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const listado = await armado().tablero.listados.facturas(await searchParams);
  const { email, rol } = sesion.usuario;
  const { mes, moneda, filas } = listado;
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
          cabeceras={[
            "Servicio",
            "Factura",
            "Fecha",
            "Sin IVA",
            "IVA",
            "Total",
          ]}
        >
          {filas.map((fila) => (
            <tr key={`${fila.servicioId}-${fila.numero}`}>
              <td>
                <a href={`/servicios/${fila.servicioId}`}>{fila.servicio}</a>
              </td>
              <td>{fila.numero}</td>
              <td>{fila.fecha}</td>
              <td>{fila.sinIva}</td>
              <td>{fila.iva}</td>
              <td>{fila.total}</td>
            </tr>
          ))}
        </Tabla>
        <p className="mt-3" data-total-sin-iva>
          Sin IVA: {listado.totalSinIva}
        </p>
        <p data-total-iva>IVA: {listado.totalIva}</p>
        <p data-total>Total con IVA: {listado.total}</p>
      </main>
    </Marco>
  );
}
