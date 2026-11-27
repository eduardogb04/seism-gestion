/**
 * Los pagos del mes en una moneda (F2-10): el listado al que lleva *Pagado*
 * del tablero, con el total al pie.
 */

import { armado } from "../../../infraestructura/arranque/armado.ts";
import { EncabezadoDePlata } from "../../_plata/encabezado-de-plata.tsx";
import {
  Importe,
  ListaDeTarjetas,
  TarjetaDeFila,
  Totales,
  Vacio,
} from "../../_plata/piezas.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { Marco } from "../../_ui/marco.tsx";
import {
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  Tabla,
} from "../../_ui/tabla.tsx";
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
  const clave = (fila: (typeof filas)[number]) =>
    `${fila.egresoId}-${fila.fecha}-${fila.importe}`;
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main className="flex flex-col gap-5">
        <EncabezadoDePlata activa="pagado" />
        <p className="m-0 text-texto-2">
          Pagado en <strong className="text-texto">{mes.nombre}</strong> en{" "}
          {moneda}. <Enlace href={`/?mes=${mes.mes}`}>Volver al inicio</Enlace>
        </p>
        {filas.length === 0 ? (
          <Vacio titulo="No hay pagos en este mes." />
        ) : (
          <>
            <div className="hidden md:block [&_td]:text-[13px] [&_th]:text-[12px] [&_th:nth-child(3)]:text-right">
              <Tabla
                titulo="Pagos del mes"
                cabeceras={["Egreso", "Fecha", "Importe"]}
              >
                {filas.map((fila) => (
                  <tr key={clave(fila)} className={CLASES_DE_FILA_ENLAZADA}>
                    <td>
                      <Enlace
                        href={`/egresos/${fila.egresoId}`}
                        className={CLASES_DE_ENLACE_DE_FILA}
                      >
                        {fila.concepto}
                      </Enlace>
                    </td>
                    <td className="cifras whitespace-nowrap">{fila.fecha}</td>
                    <td className="text-right whitespace-nowrap">
                      <Importe texto={fila.importe} />
                    </td>
                  </tr>
                ))}
              </Tabla>
            </div>
            <ListaDeTarjetas>
              {filas.map((fila) => (
                <TarjetaDeFila
                  key={clave(fila)}
                  href={`/egresos/${fila.egresoId}`}
                  titulo={
                    <span className="block truncate">{fila.concepto}</span>
                  }
                  derecha={<Importe texto={fila.importe} />}
                >
                  <span className="cifras text-[12px] text-texto-3">
                    {fila.fecha}
                  </span>
                </TarjetaDeFila>
              ))}
            </ListaDeTarjetas>
          </>
        )}
        <Totales
          renglones={[
            {
              etiqueta: "Total pagado",
              valor: listado.total,
              dato: "data-total",
            },
          ]}
        />
      </main>
    </Marco>
  );
}
