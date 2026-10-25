/**
 * Las facturas y los egresos que el inicio no puede sumar en la moneda elegida
 * por no tener tipo de cambio (F3-08, ADR 0042): la lista a la que lleva el
 * aviso, con su mismo conteo. HTML del servidor, sin JavaScript de cliente.
 */

import { armado } from "../../infraestructura/arranque/armado.ts";
import { FILA_ENLAZADA } from "../_ui/listado-abm.tsx";
import { Marco } from "../_ui/marco.tsx";
import { Tabla } from "../_ui/tabla.tsx";
import { sesionExigida } from "../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/sin-tipo-de-cambio";

export default async function SinTipoDeCambio({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const { moneda, orden, direccion, filas } =
    await armado().tablero.sinTipoDeCambio(await searchParams);
  const { email, rol } = sesion.usuario;
  const ordenable = (columna: "tipo" | "numero" | "fecha", texto: string) => ({
    texto,
    orden: {
      sentido: columna === orden ? direccion : null,
      enlace: `${RUTA}?${new URLSearchParams({
        moneda,
        orden: columna,
        direccion: columna === orden && direccion === "asc" ? "desc" : "asc",
      })}`,
    },
  });
  return (
    <Marco email={email} rol={rol} rutaActual="/">
      <main>
        <h1>Documentos sin tipo de cambio</h1>
        <p className="mb-4">
          <a href={`/?${new URLSearchParams({ moneda })}`}>Volver al inicio</a>
        </p>
        {filas.length === 0 ? (
          <p data-sin-documentos>
            No hay documentos sin tipo de cambio para mirar en{" "}
            {moneda === "ARS" ? "pesos" : "dólares"}.
          </p>
        ) : (
          <Tabla
            cabeceras={[
              ordenable("tipo", "Tipo"),
              ordenable("numero", "Número"),
              ordenable("fecha", "Fecha"),
              "Importe",
            ]}
          >
            {filas.map((fila) => (
              <tr
                key={`${fila.enlace}-${fila.numero}`}
                className="relative cursor-pointer hover:bg-superficie-alta"
              >
                <td>
                  <a href={fila.enlace} className={FILA_ENLAZADA}>
                    {fila.tipo}
                  </a>
                </td>
                <td>{fila.numero}</td>
                <td>{fila.fecha}</td>
                <td>{fila.importe}</td>
              </tr>
            ))}
          </Tabla>
        )}
      </main>
    </Marco>
  );
}
