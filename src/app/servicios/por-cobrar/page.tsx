/**
 * *Por cobrar* (F2-07, ADR 0037): las facturas con saldo, por vencimiento, con
 * los días de atraso de la que ya venció y, al pie, lo que queda por cobrar en
 * cada moneda. HTML del servidor, sin JavaScript de cliente.
 */

import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

const RUTA = "/servicios/por-cobrar";

export default async function PorCobrar() {
  const sesion = await sesionExigida();
  const { filas, saldos } = await armado().cobros.porCobrar();
  const { email, rol } = sesion.usuario;
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main>
        <h1>Por cobrar</h1>
        <Tabla
          cabeceras={[
            "Servicio",
            "Cliente",
            "Factura",
            "Vencimiento",
            "Total con IVA",
            "Saldo",
            "Atraso",
          ]}
        >
          {filas.map((fila) => (
            <tr key={`${fila.servicioId}-${fila.numero}`}>
              <td>
                <a href={`/servicios/${fila.servicioId}`}>{fila.servicio}</a>
              </td>
              <td>{fila.cliente}</td>
              <td>{fila.numero}</td>
              <td>{fila.vencimiento}</td>
              <td>{fila.total}</td>
              <td>{fila.saldo}</td>
              <td>{fila.atraso}</td>
            </tr>
          ))}
        </Tabla>
        <p className="mt-3" data-saldos-por-moneda>
          Saldo por cobrar: {saldos.length === 0 ? "nada" : saldos.join(" · ")}
        </p>
      </main>
    </Marco>
  );
}
