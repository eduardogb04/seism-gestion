/**
 * Los egresos de un servicio (F2-08): cada uno enlaza a su pantalla, y abajo el
 * total por moneda. HTML del servidor.
 */

import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { Tabla } from "../../_ui/tabla.tsx";

const CABECERAS = ["Fecha", "Concepto", "Centro de costo", "Importe"];

export async function Egresos({
  servicioId,
  sinFilasNoSeDibuja,
}: {
  readonly servicioId: string;
  /** La etapa no ofrece registrar egresos: sin ninguno, la sección no se dibuja. */
  readonly sinFilasNoSeDibuja: boolean;
}) {
  const { egresos, totales } =
    await armado().egresosDeServicio.listar(servicioId);
  if (sinFilasNoSeDibuja && egresos.length === 0) {
    return null;
  }
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Egresos</h2>
      {egresos.length === 0 ? (
        <p>Todavía no tiene egresos imputados.</p>
      ) : (
        <>
          <Tabla cabeceras={CABECERAS}>
            {egresos.map((egreso) => (
              <tr key={egreso.id}>
                <td>{egreso.fecha}</td>
                <td>
                  <Enlace href={`/egresos/${egreso.id}`}>
                    {egreso.concepto}
                  </Enlace>
                </td>
                <td>{egreso.centroCosto}</td>
                <td>{egreso.importe}</td>
              </tr>
            ))}
          </Tabla>
          <p className="mt-2">
            Total:{" "}
            {totales.map((total, posicion) => (
              <strong key={total}>
                {posicion > 0 ? " · " : ""}
                {total}
              </strong>
            ))}
          </p>
        </>
      )}
    </section>
  );
}
