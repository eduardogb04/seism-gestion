/**
 * Los cobros del mes en una moneda (F2-10): el listado al que lleva *Cobrado*
 * del tablero, con la retención de cada uno y el total al pie.
 */

import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/servicios/cobros";

export default async function CobrosDelMes({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const listado = await armado().tablero.listados.cobros(await searchParams);
  const { email, rol } = sesion.usuario;
  const { mes, moneda, filas } = listado;
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main>
        <h1>
          Cobrado · {mes.nombre} · {moneda}
        </h1>
        <p>
          <a href={`/?mes=${mes.mes}`}>Volver al inicio</a>
        </p>
        <Tabla
          cabeceras={["Factura", "Fecha", "Importe", "Retención", "Total"]}
        >
          {filas.map((fila) => (
            <tr
              key={`${fila.servicioId}-${fila.factura}-${fila.fecha}-${fila.importe}`}
            >
              <td>
                <a href={`/servicios/${fila.servicioId}`}>{fila.factura}</a>
              </td>
              <td>{fila.fecha}</td>
              <td>{fila.importe}</td>
              <td>{fila.retencion}</td>
              <td>{fila.total}</td>
            </tr>
          ))}
        </Tabla>
        <p className="mt-3" data-total>
          Total cobrado: {listado.total}
        </p>
      </main>
    </Marco>
  );
}
