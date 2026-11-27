/**
 * *Por cobrar* (F2-07, ADR 0037): las facturas con saldo, por vencimiento, con
 * lo vencido arriba y lo próximo debajo. Cada una ofrece «Registrar cobro» en
 * una ventana sobre este mismo listado (`?cobrar=<id>`, F3-07). HTML del
 * servidor, sin JavaScript de cliente.
 */

import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../../casos-uso/servicios/servicios.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { EncabezadoDePlata } from "../../_plata/encabezado-de-plata.tsx";
import { Totales } from "../../_plata/piezas.tsx";
import { type FilaPorVencer, PorVencer } from "../../_plata/por-vencer.tsx";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { Marco } from "../../_ui/marco.tsx";
import { cabeceraOrdenable } from "../../_ui/tabla.tsx";
import { VentanaDeCobro } from "../../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/servicios/por-cobrar";

/** El listado con su orden y, si se pide, la ventana de cobro abierta. */
function enlace(
  orden: string,
  direccion: "asc" | "desc",
  cobrar?: string,
): string {
  const consulta = new URLSearchParams({ orden, direccion });
  if (cobrar !== undefined) {
    consulta.set("cobrar", cobrar);
  }
  return `${RUTA}?${consulta}`;
}

export default async function PorCobrar({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const { filas, saldos, orden, direccion } =
    await armado().cobros.porCobrar(parametros);
  const { email, rol } = sesion.usuario;
  const puedeEscribir = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const aCobrar =
    typeof parametros.cobrar === "string" ? parametros.cobrar : null;
  const ordenable = (texto: string, columna: string) =>
    cabeceraOrdenable(texto, columna, { orden, direccion }, (o, d) =>
      enlace(o, d),
    );
  const vista: FilaPorVencer[] = filas.map((fila) => ({
    id: fila.facturaId,
    href: `/servicios/facturas/${fila.facturaId}`,
    principal: fila.numero,
    mono: true,
    tercero: fila.cliente,
    servicio: {
      codigo: fila.servicio,
      href: `/servicios/${fila.servicioId}`,
    },
    vence: fila.vencimiento,
    atraso: fila.atraso,
    total: fila.total,
    saldo: fila.saldo,
    accion: puedeEscribir ? (
      <Enlace
        href={enlace(orden, direccion, fila.facturaId)}
        scroll={false}
        className={clasesDeBoton("secundario", "h-8 px-2.5 text-[13px]")}
      >
        Registrar cobro
      </Enlace>
    ) : null,
  }));
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main className="flex flex-col gap-5">
        <EncabezadoDePlata activa="por-cobrar" />
        <PorVencer
          grupos={[
            {
              id: "vencido",
              titulo: "Vencido",
              tono: "peligro",
              filas: vista.filter(({ atraso }) => atraso !== ""),
            },
            {
              id: "proximo",
              titulo: "Próximo",
              tono: "normal",
              filas: vista.filter(({ atraso }) => atraso === ""),
            },
          ]}
          cabeceras={{
            principal: ordenable("Comprobante", "factura"),
            servicio: ordenable("Servicio", "servicio"),
            vence: ordenable("Vence", "vencimiento"),
          }}
          conServicio
          conAccion={puedeEscribir}
          vacio="Nada por cobrar. Todo al día."
        />
        {saldos.length === 0 ? null : (
          <Totales
            renglones={saldos.map((valor) => ({
              etiqueta: "Saldo por cobrar",
              valor,
              dato: "data-saldos-por-moneda",
            }))}
          />
        )}
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
