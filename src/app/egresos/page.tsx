/**
 * Egresos: lo que sale, en una tabla propia con el patrón de Ingresos (tarjetas
 * en celular, totales por moneda al pie). Alta, edición y baja abren la ventana
 * del ABM sobre este mismo listado; «Registrar pago» abre la de pago
 * (`?pagar=<id>`, F3-07) en los egresos que todavía deben algo.
 */

import { HandCoins, Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { SIN_CAMBIO } from "../../casos-uso/abm/cambio.ts";
import { EGRESOS } from "../../casos-uso/abm/egresos.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { hoyISO } from "../_inicio/formato.ts";
import { EncabezadoDePlata } from "../_plata/encabezado-de-plata.tsx";
import { centavosDe, montoDe } from "../_plata/importes-escritos.ts";
import {
  Importe,
  ListaDeTarjetas,
  Paginas,
  TarjetaDeFila,
  Totales,
  Vacio,
} from "../_plata/piezas.tsx";
import { clasesDeBoton } from "../_ui/boton.tsx";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { IconoDeDocumento } from "../_ui/icono-de-documento.tsx";
import {
  BuscadorDeListado,
  consultaDe,
  enlace,
  vistaDe,
} from "../_ui/listado-abm.tsx";
import { Marco } from "../_ui/marco.tsx";
import {
  CLASES_DE_ACCIONES,
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  cabeceraOrdenable,
  Tabla,
} from "../_ui/tabla.tsx";
import { VentanaDePago } from "../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import {
  ContenidoDeVentana,
  type PropsListado,
  ventanaPedida,
} from "../catalogo/_abm/paginas.tsx";

const { ruta } = EGRESOS;

function BotonDeIcono({
  href,
  texto,
  peligro = false,
  children,
}: {
  readonly href: string;
  readonly texto: string;
  readonly peligro?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Enlace
      href={href}
      scroll={false}
      aria-label={texto}
      title={texto}
      className={cn(
        "presionable grid size-8 place-items-center rounded-md text-texto-2 no-underline hover:bg-superficie-3",
        peligro ? "hover:text-peligro" : "hover:text-texto",
      )}
    >
      {children}
    </Enlace>
  );
}

function Vencido() {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-peligro-suave px-2 py-0.5 text-xs font-medium whitespace-nowrap text-peligro ring-1 ring-peligro/20 ring-inset">
      Vencido
    </span>
  );
}

function SinCambio() {
  return <span className="block text-[12px] text-texto-3">TC sin cargar</span>;
}

export default async function Egresos({ searchParams }: PropsListado) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const listado = await armado().abm.listar(EGRESOS, parametros);
  const pendientes = new Set(await armado().pagos.pendientes());
  const vista = vistaDe(listado);
  const pedida = ventanaPedida(parametros);
  const { email, rol } = sesion.usuario;
  const puedeEscribir = EGRESOS.rolesQueEscriben.includes(rol);
  const hoy = hoyISO();
  const aPagar =
    puedeEscribir && typeof parametros.pagar === "string"
      ? parametros.pagar
      : null;
  const { registros, celdas, total, pagina, paginas, orden, direccion } =
    listado;

  const filas = registros.map(({ valor }) => {
    const [
      fecha = "",
      concepto = "",
      centro = "",
      proveedor = "",
      importe = "",
      cambio = "",
      vence = "",
    ] = celdas[valor.id] ?? [];
    const conSaldo = pendientes.has(valor.id);
    return {
      id: valor.id,
      fecha,
      concepto,
      detalle: [proveedor, centro].filter((t) => t !== "").join(" · "),
      importe,
      sinCambio: cambio === SIN_CAMBIO,
      vence,
      conSaldo,
      documentoId: valor.comprobanteId,
      vencido:
        conSaldo && valor.vencimiento !== null && valor.vencimiento < hoy,
    };
  });

  const porMoneda = new Map<string, bigint>();
  for (const { importe } of filas) {
    const moneda = importe.split(" ")[0] ?? "";
    porMoneda.set(moneda, (porMoneda.get(moneda) ?? 0n) + centavosDe(importe));
  }

  const conVentana = (clave: "editar" | "baja", id: string) =>
    enlace(ruta, vista, { clave, valor: id });
  const ordenable = (texto: string, columna: string) =>
    cabeceraOrdenable(texto, columna, { orden, direccion }, (o, d) =>
      enlace(ruta, { ...vista, orden: o, direccion: d, pagina: 1 }),
    );
  const conAcciones =
    puedeEscribir || filas.some((f) => f.documentoId !== null);
  const acciones = (fila: (typeof filas)[number]) =>
    conAcciones ? (
      <div className="flex items-center justify-end gap-0.5">
        <IconoDeDocumento id={fila.documentoId} />
        {puedeEscribir ? (
          <>
            <BotonDeIcono href={conVentana("editar", fila.id)} texto="Editar">
              <Pencil aria-hidden="true" className="size-4" />
            </BotonDeIcono>
            <BotonDeIcono
              href={conVentana("baja", fila.id)}
              texto="Dar de baja"
              peligro
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </BotonDeIcono>
            {fila.conSaldo ? (
              <BotonDeIcono
                href={`${enlace(ruta, vista)}&pagar=${fila.id}`}
                texto="Registrar pago"
              >
                <HandCoins aria-hidden="true" className="size-4" />
              </BotonDeIcono>
            ) : null}
          </>
        ) : null}
      </div>
    ) : undefined;
  const filtrado =
    listado.buscar !== "" || listado.filtros.some((f) => f.elegido !== "");

  return (
    <Marco email={email} rol={rol} rutaActual={ruta}>
      <main className="flex flex-col gap-5">
        <EncabezadoDePlata
          activa="egresos"
          accion={
            puedeEscribir ? (
              <Enlace
                href="/egresos?nuevo=1"
                scroll={false}
                className={clasesDeBoton("primario")}
              >
                <Plus aria-hidden="true" />
                Registrar egreso
              </Enlace>
            ) : undefined
          }
        />
        <BuscadorDeListado
          ruta={ruta}
          buscar={listado.buscar}
          filtros={listado.filtros}
          orden={orden}
          direccion={direccion}
        />
        {total === 0 ? (
          <Vacio
            titulo={
              filtrado
                ? "No encontramos egresos con esa búsqueda."
                : "Todavía no se cargó ningún egreso."
            }
            {...(filtrado
              ? { texto: "Probá con otras palabras o sacá los filtros." }
              : {})}
          />
        ) : (
          <>
            <div className="hidden md:block [&_th:nth-child(4)]:text-right">
              <Tabla
                titulo="Egresos"
                cabeceras={[
                  ordenable("Fecha", "fecha"),
                  ordenable("Concepto", "concepto"),
                  "Vence",
                  ordenable("Importe", "importe"),
                  ...(conAcciones ? ["Acciones"] : []),
                ]}
              >
                {filas.map((fila) => (
                  <tr key={fila.id} className={CLASES_DE_FILA_ENLAZADA}>
                    <td className="cifras whitespace-nowrap">{fila.fecha}</td>
                    <td className="w-full max-w-0">
                      <Enlace
                        href={`${ruta}/${fila.id}`}
                        className={cn(
                          CLASES_DE_ENLACE_DE_FILA,
                          "block truncate",
                        )}
                      >
                        {fila.concepto}
                      </Enlace>
                      {fila.detalle === "" ? null : (
                        <span className="block truncate text-[12px] text-texto-3">
                          {fila.detalle}
                        </span>
                      )}
                    </td>
                    <td className="cifras whitespace-nowrap">
                      {fila.vence === "" ? null : (
                        <span className="flex flex-col gap-1">
                          {fila.vence}
                          {fila.vencido ? <Vencido /> : null}
                        </span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Importe texto={fila.importe} />
                      {fila.sinCambio ? <SinCambio /> : null}
                    </td>
                    {conAcciones ? (
                      <td
                        className={cn(CLASES_DE_ACCIONES, "whitespace-nowrap")}
                      >
                        {acciones(fila)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </Tabla>
            </div>
            <ListaDeTarjetas>
              {filas.map((fila) => (
                <TarjetaDeFila
                  key={fila.id}
                  href={`${ruta}/${fila.id}`}
                  titulo={
                    <span className="block truncate">{fila.concepto}</span>
                  }
                  derecha={
                    <span className="flex shrink-0 flex-col items-end">
                      <Importe texto={fila.importe} />
                      {fila.sinCambio ? <SinCambio /> : null}
                    </span>
                  }
                  accion={acciones(fila)}
                >
                  <span className="cifras truncate text-[12px] text-texto-3">
                    {[fila.fecha, fila.detalle]
                      .filter((t) => t !== "")
                      .join(" · ")}
                  </span>
                  {fila.vence === "" ? null : (
                    <span className="cifras flex items-center gap-2 text-[12px] text-texto-3">
                      Vence {fila.vence}
                      {fila.vencido ? <Vencido /> : null}
                    </span>
                  )}
                </TarjetaDeFila>
              ))}
            </ListaDeTarjetas>
            <Paginas
              texto={`Página ${pagina} de ${paginas} · ${total} en total`}
              anterior={
                pagina > 1
                  ? enlace(ruta, { ...vista, pagina: pagina - 1 })
                  : null
              }
              siguiente={
                pagina < paginas
                  ? enlace(ruta, { ...vista, pagina: pagina + 1 })
                  : null
              }
            />
            <Totales
              renglones={[...porMoneda].map(([moneda, centavos]) => ({
                etiqueta: `Total ${moneda}${paginas > 1 ? " de esta página" : ""}`,
                valor: `${moneda} ${montoDe(centavos)}`,
                dato: `data-total-${moneda.toLowerCase()}`,
              }))}
            />
          </>
        )}
      </main>
      {aPagar === null ? null : (
        <VentanaDePago egresoId={aPagar} rutaAlCerrar={enlace(ruta, vista)} />
      )}
      {pedida === null ? null : (
        <ContenidoDeVentana
          definicion={EGRESOS}
          pedida={pedida}
          vuelta={consultaDe(vista)}
          rutaAlCerrar={enlace(ruta, vista)}
          preseleccion={
            typeof parametros.servicio === "string"
              ? { servicioId: parametros.servicio }
              : {}
          }
        />
      )}
    </Marco>
  );
}
