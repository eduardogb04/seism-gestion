/**
 * Ingresos: las facturas del mes en una moneda (F2-10), el listado al que lleva
 * *Facturado* del tablero, con el IVA de cada una y el total al pie. La fila
 * entera lleva a la factura y cada una con saldo ofrece «Registrar cobro» en
 * una ventana sobre este mismo listado (`?cobrar=<id>`, F3-07). Cada fila
 * dice su tipo y se filtra por él (`?tipo=`, F6-03); la nota de crédito resta.
 */

import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../../casos-uso/servicios/servicios.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { EncabezadoDePlata } from "../../_plata/encabezado-de-plata.tsx";
import {
  FilaDeFiltros,
  FiltroEnlace,
  Importe,
  ListaDeTarjetas,
  TarjetaDeFila,
  Totales,
  Vacio,
} from "../../_plata/piezas.tsx";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { cn } from "../../_ui/cn.ts";
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

const RUTA = "/servicios/facturas";

export default async function Ingresos({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const listado = await armado().tablero.listados.facturas(parametros);
  const { email, rol } = sesion.usuario;
  const { mes, moneda, filas, orden, direccion, tipo } = listado;
  const puedeEscribir = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const aCobrar =
    typeof parametros.cobrar === "string" ? parametros.cobrar : null;
  /** El listado con su mes, moneda, tipo y orden y, si se pide, la ventana de cobro abierta. */
  const enlace = (
    ordenNuevo: string,
    direccionNueva: "asc" | "desc",
    cobrar?: string,
    tipoNuevo: string = tipo,
  ) => {
    const consulta = new URLSearchParams({
      mes: mes.mes,
      moneda,
      orden: ordenNuevo,
      direccion: direccionNueva,
    });
    if (tipoNuevo !== "") {
      consulta.set("tipo", tipoNuevo);
    }
    if (cobrar !== undefined) {
      consulta.set("cobrar", cobrar);
    }
    return `${RUTA}?${consulta}`;
  };
  const ordenable = (texto: string, columna: string) =>
    cabeceraOrdenable(texto, columna, { orden, direccion }, (o, d) =>
      enlace(o, d),
    );
  const derecha =
    "[&_th:nth-child(5)]:text-right [&_th:nth-child(6)]:text-right [&_th:nth-child(7)]:text-right";
  const botonDeCobro = (facturaId: string) => (
    <Enlace
      href={enlace(orden, direccion, facturaId)}
      scroll={false}
      className={clasesDeBoton("secundario", "h-8 px-2.5 text-[13px]")}
    >
      Registrar cobro
    </Enlace>
  );
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main className="flex flex-col gap-5">
        <EncabezadoDePlata activa="ingresos" />
        <p className="m-0 text-texto-2">
          Facturado en <strong className="text-texto">{mes.nombre}</strong> en{" "}
          {moneda}. <Enlace href={`/?mes=${mes.mes}`}>Volver al inicio</Enlace>
        </p>
        <FilaDeFiltros>
          <FiltroEnlace
            href={enlace(orden, direccion, undefined, "")}
            activo={tipo === ""}
          >
            Todos
          </FiltroEnlace>
          {listado.tipos.map(({ valor, etiqueta }) => (
            <FiltroEnlace
              key={valor}
              href={enlace(orden, direccion, undefined, valor)}
              activo={tipo === valor}
            >
              {etiqueta}
            </FiltroEnlace>
          ))}
        </FilaDeFiltros>
        {filas.length === 0 ? (
          <Vacio
            titulo="No hay facturas con estos filtros."
            texto="Probá con otro tipo o con otro mes desde el inicio."
          />
        ) : (
          <>
            <div
              className={cn(
                "hidden md:block [&_td]:text-[13px] [&_th]:text-[12px]",
                derecha,
              )}
            >
              <Tabla
                titulo="Facturas del mes"
                cabeceras={[
                  "Tipo",
                  ordenable("Factura", "numero"),
                  ordenable("Servicio", "servicio"),
                  ordenable("Fecha", "fecha"),
                  "Sin IVA",
                  "IVA",
                  "Total",
                  ...(puedeEscribir ? ["Acciones"] : []),
                ]}
              >
                {filas.map((fila) => (
                  <tr key={fila.facturaId} className={CLASES_DE_FILA_ENLAZADA}>
                    <td className="whitespace-nowrap text-texto-2">
                      {fila.tipo}
                    </td>
                    <td>
                      <Enlace
                        href={`/servicios/facturas/${fila.facturaId}`}
                        className={cn(
                          CLASES_DE_ENLACE_DE_FILA,
                          "font-mono text-[12px]",
                        )}
                      >
                        {fila.numero}
                      </Enlace>
                    </td>
                    <td className={cn(CLASES_DE_ACCIONES, "whitespace-nowrap")}>
                      <a
                        href={`/servicios/${fila.servicioId}`}
                        className="font-mono text-[12px]"
                      >
                        {fila.servicio}
                      </a>
                    </td>
                    <td className="cifras whitespace-nowrap">{fila.fecha}</td>
                    <td className="text-right whitespace-nowrap text-texto-2">
                      <Importe texto={fila.sinIva} className="font-normal" />
                    </td>
                    <td className="text-right whitespace-nowrap text-texto-2">
                      <Importe texto={fila.iva} className="font-normal" />
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Importe texto={fila.total} />
                    </td>
                    {puedeEscribir ? (
                      <td className={cn(CLASES_DE_ACCIONES, "text-right")}>
                        {fila.conSaldo ? botonDeCobro(fila.facturaId) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </Tabla>
            </div>
            <ListaDeTarjetas>
              {filas.map((fila) => (
                <TarjetaDeFila
                  key={fila.facturaId}
                  href={`/servicios/facturas/${fila.facturaId}`}
                  titulo={
                    <span className="block truncate font-mono text-[13px]">
                      {fila.numero}
                    </span>
                  }
                  derecha={<Importe texto={fila.total} />}
                  accion={
                    puedeEscribir && fila.conSaldo
                      ? botonDeCobro(fila.facturaId)
                      : undefined
                  }
                >
                  <span className="cifras flex flex-wrap items-center gap-x-2 text-[12px] text-texto-3">
                    {fila.tipo} · {fila.fecha} ·{" "}
                    <a
                      href={`/servicios/${fila.servicioId}`}
                      className="relative z-10 font-mono"
                    >
                      {fila.servicio}
                    </a>
                  </span>
                  <span className="cifras text-[12px] text-texto-3">
                    Sin IVA {fila.sinIva} · IVA {fila.iva}
                  </span>
                </TarjetaDeFila>
              ))}
            </ListaDeTarjetas>
          </>
        )}
        <Totales
          renglones={[
            {
              etiqueta: "Sin IVA",
              valor: listado.totalSinIva,
              dato: "data-total-sin-iva",
            },
            {
              etiqueta: "IVA",
              valor: listado.totalIva,
              dato: "data-total-iva",
            },
            {
              etiqueta: "Total con IVA",
              valor: listado.total,
              dato: "data-total",
            },
          ]}
        />
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
