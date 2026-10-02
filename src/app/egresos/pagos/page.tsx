/**
 * *Por pagar* (F2-09): los egresos con saldo, por vencimiento, con los días de
 * atraso y, al pie, lo que queda por pagar en cada moneda. Con la casilla,
 * también los que ya no deben nada. HTML del servidor, sin JavaScript de cliente.
 */

import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Boton } from "../../_ui/boton.tsx";
import { CasillaSiNo } from "../../_ui/campo-texto.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/egresos/pagos";

function enlace(pagina: number, incluirPagados: boolean): string {
  const consulta = new URLSearchParams({ pagina: String(pagina) });
  if (incluirPagados) {
    consulta.set("pagados", "si");
  }
  return `${RUTA}?${consulta}`;
}

export default async function PorPagar({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const listado = await armado().pagos.porPagar(await searchParams);
  const { email, rol } = sesion.usuario;
  const { filas, total, pagina, paginas, incluirPagados, saldos } = listado;
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main>
        <h1>Por pagar</h1>
        <form action={RUTA} className="mb-4 flex flex-wrap items-end gap-3">
          <CasillaSiNo
            etiqueta="Ver también los pagados"
            name="pagados"
            value="si"
            defaultChecked={incluirPagados}
          />
          <Boton variante="secundario" type="submit">
            Aplicar
          </Boton>
        </form>
        <Tabla
          cabeceras={[
            "Fecha",
            "Concepto",
            "Centro de costo",
            "Proveedor",
            "Total",
            "Pagado",
            "Saldo",
            "Vencimiento",
            "Atraso",
          ]}
        >
          {filas.map((fila) => (
            <tr key={fila.id}>
              <td>{fila.fecha}</td>
              <td>
                <a href={`/egresos/${fila.id}`}>{fila.concepto}</a>
              </td>
              <td>{fila.centroCosto}</td>
              <td>{fila.proveedor}</td>
              <td>{fila.total}</td>
              <td>{fila.pagado}</td>
              <td>{fila.saldo}</td>
              <td>{fila.vencimiento}</td>
              <td>{fila.atraso}</td>
            </tr>
          ))}
        </Tabla>
        <p className="mt-3" data-saldos-por-moneda>
          Saldo por pagar: {saldos.length === 0 ? "nada" : saldos.join(" · ")}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-3">
          <span data-total-del-listado>
            {total === 0
              ? "No hay nada para mostrar."
              : `Página ${pagina} de ${paginas} · ${total} en total`}
          </span>
          {pagina > 1 ? (
            <a href={enlace(pagina - 1, incluirPagados)}>Anterior</a>
          ) : null}
          {pagina < paginas ? (
            <a href={enlace(pagina + 1, incluirPagados)}>Siguiente</a>
          ) : null}
        </p>
      </main>
    </Marco>
  );
}
