/**
 * Los pagos del mes en una moneda (F2-10): el listado al que lleva *Pagado*
 * del tablero, con el total al pie.
 */

import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/egresos/pagos-hechos";

export default async function PagosDelMes({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const listado = await armado().tablero.listados.pagos(await searchParams);
  const { email, rol } = sesion.usuario;
  const { mes, moneda, filas } = listado;
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main>
        <h1>
          Pagado · {mes.nombre} · {moneda}
        </h1>
        <p>
          <a href={`/?mes=${mes.mes}`}>Volver al inicio</a>
        </p>
        <Tabla cabeceras={["Egreso", "Fecha", "Importe"]}>
          {filas.map((fila) => (
            <tr key={`${fila.egresoId}-${fila.fecha}-${fila.importe}`}>
              <td>
                <a href={`/egresos/${fila.egresoId}`}>{fila.concepto}</a>
              </td>
              <td>{fila.fecha}</td>
              <td>{fila.importe}</td>
            </tr>
          ))}
        </Tabla>
        <p className="mt-3" data-total>
          Total pagado: {listado.total}
        </p>
      </main>
    </Marco>
  );
}
