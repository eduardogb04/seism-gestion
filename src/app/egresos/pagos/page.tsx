/**
 * *Por pagar* (F2-09): los egresos con saldo, por vencimiento, con los días de
 * atraso y, al pie, lo que queda por pagar en cada moneda. Con la casilla,
 * también los que ya no deben nada. La fila entera lleva al egreso y cada una
 * con saldo ofrece «Registrar pago» en una ventana sobre este mismo listado
 * (`?pagar=<id>`, F3-07). HTML del servidor, sin JavaScript de cliente.
 */

import { EGRESOS } from "../../../casos-uso/abm/egresos.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { Boton, clasesDeBoton } from "../../_ui/boton.tsx";
import { CasillaSiNo } from "../../_ui/campo-texto.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { Marco } from "../../_ui/marco.tsx";
import {
  CLASES_DE_ACCIONES,
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  cabeceraOrdenable,
  Tabla,
} from "../../_ui/tabla.tsx";
import { VentanaDePago } from "../../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/egresos/pagos";

/** El listado con su vista (casilla, orden, página) y, si se pide, la ventana de pago abierta. */
function enlace(
  vista: {
    readonly incluirPagados: boolean;
    readonly orden: string;
    readonly direccion: "asc" | "desc";
    readonly pagina: number;
  },
  pagar?: string,
): string {
  const consulta = new URLSearchParams({
    orden: vista.orden,
    direccion: vista.direccion,
    pagina: String(vista.pagina),
  });
  if (vista.incluirPagados) {
    consulta.set("pagados", "si");
  }
  if (pagar !== undefined) {
    consulta.set("pagar", pagar);
  }
  return `${RUTA}?${consulta}`;
}

/** Cada cabecera y la columna por la que ordena (`null`: esa no ordena). */
const COLUMNAS = [
  ["Concepto", "concepto"],
  ["Fecha", "fecha"],
  ["Centro de costo", "centroCosto"],
  ["Proveedor", "proveedor"],
  ["Total", null],
  ["Pagado", null],
  ["Saldo", null],
  ["Vencimiento", "vencimiento"],
  ["Atraso", null],
] as const;

export default async function PorPagar({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const listado = await armado().pagos.porPagar(parametros);
  const { email, rol } = sesion.usuario;
  const puedeEscribir = EGRESOS.rolesQueEscriben.includes(rol);
  const { filas, total, pagina, paginas, incluirPagados, saldos } = listado;
  const vista = {
    incluirPagados,
    orden: listado.orden,
    direccion: listado.direccion,
    pagina,
  };
  const aPagar = typeof parametros.pagar === "string" ? parametros.pagar : null;
  const cabeceras = COLUMNAS.map(([texto, columna]) =>
    columna === null
      ? texto
      : cabeceraOrdenable(texto, columna, vista, (orden, direccion) =>
          enlace({ ...vista, orden, direccion, pagina: 1 }),
        ),
  );
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
          <input type="hidden" name="orden" value={listado.orden} />
          <input type="hidden" name="direccion" value={listado.direccion} />
          <Boton variante="secundario" type="submit">
            Aplicar
          </Boton>
        </form>
        <Tabla
          cabeceras={puedeEscribir ? [...cabeceras, "Acciones"] : cabeceras}
        >
          {filas.map((fila) => (
            <tr key={fila.id} className={CLASES_DE_FILA_ENLAZADA}>
              <td>
                <Enlace
                  href={`/egresos/${fila.id}`}
                  className={CLASES_DE_ENLACE_DE_FILA}
                >
                  {fila.concepto}
                </Enlace>
              </td>
              <td>{fila.fecha}</td>
              <td>{fila.centroCosto}</td>
              <td>{fila.proveedor}</td>
              <td>{fila.total}</td>
              <td>{fila.pagado}</td>
              <td>{fila.saldo}</td>
              <td>{fila.vencimiento}</td>
              <td>{fila.atraso}</td>
              {puedeEscribir ? (
                <td className={CLASES_DE_ACCIONES}>
                  {fila.conSaldo ? (
                    <Enlace
                      href={enlace(vista, fila.id)}
                      scroll={false}
                      className={clasesDeBoton("primario")}
                    >
                      Registrar pago
                    </Enlace>
                  ) : null}
                </td>
              ) : null}
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
            <a href={enlace({ ...vista, pagina: pagina - 1 })}>Anterior</a>
          ) : null}
          {pagina < paginas ? (
            <a href={enlace({ ...vista, pagina: pagina + 1 })}>Siguiente</a>
          ) : null}
        </p>
      </main>
      {puedeEscribir && aPagar !== null ? (
        <VentanaDePago egresoId={aPagar} rutaAlCerrar={enlace(vista)} />
      ) : null}
    </Marco>
  );
}
