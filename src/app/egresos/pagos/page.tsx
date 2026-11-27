/**
 * *Por pagar* (F2-09): los egresos con saldo, por vencimiento, con lo vencido
 * arriba y lo próximo debajo. Con el atajo, también los que ya no deben nada.
 * Cada uno con saldo ofrece «Registrar pago» en una ventana sobre este mismo
 * listado (`?pagar=<id>`, F3-07). HTML del servidor, sin JavaScript de cliente.
 */

import { Plus } from "lucide-react";
import { EGRESOS } from "../../../casos-uso/abm/egresos.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { EncabezadoDePlata } from "../../_plata/encabezado-de-plata.tsx";
import {
  FilaDeFiltros,
  FiltroEnlace,
  Paginas,
  Totales,
} from "../../_plata/piezas.tsx";
import { type FilaPorVencer, PorVencer } from "../../_plata/por-vencer.tsx";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { Marco } from "../../_ui/marco.tsx";
import { cabeceraOrdenable } from "../../_ui/tabla.tsx";
import { VentanaDePago } from "../../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/egresos/pagos";

/** El listado con su vista (atajo, orden, página) y, si se pide, la ventana de pago abierta. */
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
  const ordenable = (texto: string, columna: string) =>
    cabeceraOrdenable(texto, columna, vista, (orden, direccion) =>
      enlace({ ...vista, orden, direccion, pagina: 1 }),
    );
  const deLaVista: (FilaPorVencer & { readonly conSaldo: boolean })[] =
    filas.map((fila) => ({
      id: fila.id,
      href: `/egresos/${fila.id}`,
      principal: fila.concepto,
      mono: false,
      tercero: [fila.proveedor, fila.centroCosto]
        .filter((texto) => texto !== "")
        .join(" · "),
      servicio: null,
      vence: fila.vencimiento,
      atraso: fila.atraso,
      total: fila.total,
      saldo: fila.saldo,
      conSaldo: fila.conSaldo,
      accion:
        puedeEscribir && fila.conSaldo ? (
          <Enlace
            href={enlace(vista, fila.id)}
            scroll={false}
            className={clasesDeBoton("secundario", "h-8 px-2.5 text-[13px]")}
          >
            Registrar pago
          </Enlace>
        ) : null,
    }));
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main className="flex flex-col gap-5">
        <EncabezadoDePlata
          activa="por-pagar"
          accion={
            puedeEscribir ? (
              <Enlace
                href="/egresos?nuevo=1"
                className={clasesDeBoton("primario")}
              >
                <Plus aria-hidden="true" />
                Registrar egreso
              </Enlace>
            ) : undefined
          }
        />
        <FilaDeFiltros>
          <FiltroEnlace
            href={enlace({
              ...vista,
              incluirPagados: !incluirPagados,
              pagina: 1,
            })}
            activo={incluirPagados}
          >
            Ver también los pagados
          </FiltroEnlace>
        </FilaDeFiltros>
        <PorVencer
          grupos={[
            {
              id: "vencido",
              titulo: "Vencido",
              tono: "peligro",
              filas: deLaVista.filter(
                ({ atraso, conSaldo }) => conSaldo && atraso !== "",
              ),
            },
            {
              id: "proximo",
              titulo: "Próximo",
              tono: "normal",
              filas: deLaVista.filter(
                ({ atraso, conSaldo }) => conSaldo && atraso === "",
              ),
            },
            {
              id: "pagado",
              titulo: "Pagados",
              tono: "normal",
              filas: deLaVista.filter(({ conSaldo }) => !conSaldo),
            },
          ]}
          cabeceras={{
            principal: ordenable("Egreso", "concepto"),
            servicio: "Servicio",
            vence: ordenable("Vence", "vencimiento"),
          }}
          conServicio={false}
          conAccion={puedeEscribir}
          vacio="Nada por pagar."
        />
        <Paginas
          texto={
            total === 0
              ? "No hay nada para mostrar."
              : `Página ${pagina} de ${paginas} · ${total} en total`
          }
          anterior={
            pagina > 1 ? enlace({ ...vista, pagina: pagina - 1 }) : null
          }
          siguiente={
            pagina < paginas ? enlace({ ...vista, pagina: pagina + 1 }) : null
          }
        />
        {saldos.length === 0 ? null : (
          <Totales
            renglones={saldos.map((valor) => ({
              etiqueta: "Saldo por pagar",
              valor,
              dato: "data-saldos-por-moneda",
            }))}
          />
        )}
      </main>
      {puedeEscribir && aPagar !== null ? (
        <VentanaDePago egresoId={aPagar} rutaAlCerrar={enlace(vista)} />
      ) : null}
    </Marco>
  );
}
