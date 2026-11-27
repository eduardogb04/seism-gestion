/**
 * El encabezado de las cinco pantallas de Plata: título, cuatro métricas y las
 * pestañas (enlaces) entre Por cobrar, Ingresos, Por pagar, Pagado y Egresos.
 * Los totales salen de las mismas consultas del tablero de inicio.
 */

import { HandCoins, PiggyBank, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { TarjetaKpi } from "../_ui/tarjeta-kpi.tsx";

type Pestana = "por-cobrar" | "ingresos" | "por-pagar" | "pagado" | "egresos";

const PESTANAS: readonly {
  readonly id: Pestana;
  readonly texto: string;
  readonly href: string;
}[] = [
  { id: "por-cobrar", texto: "Por cobrar", href: "/servicios/por-cobrar" },
  { id: "ingresos", texto: "Ingresos", href: "/servicios/facturas" },
  { id: "por-pagar", texto: "Por pagar", href: "/egresos/pagos" },
  { id: "pagado", texto: "Pagado", href: "/egresos/pagos-hechos" },
  { id: "egresos", texto: "Egresos", href: "/egresos" },
];

type Linea = { readonly valor: string; readonly vencido: string };

/** Hay algo distinto de cero en `ARS 0,00`. */
const hayImporte = (valor: string): boolean => /[1-9]/.test(valor);

/** La primera moneda como valor; lo vencido de esa y las demás monedas, en el detalle. */
function MetricaDePlata({
  titulo,
  Icono,
  lineas,
  sinDatos,
}: {
  readonly titulo: string;
  readonly Icono: typeof Wallet;
  readonly lineas: readonly Linea[];
  readonly sinDatos: string;
}) {
  const [primera, ...otras] = lineas;
  const partes: { readonly clave: string; readonly nodo: ReactNode }[] = [];
  const vencidos = lineas
    .filter(({ vencido }) => hayImporte(vencido))
    .map(({ vencido }) => vencido);
  if (vencidos.length > 0) {
    partes.push({
      clave: "vencido",
      nodo: (
        <span className="text-peligro">{vencidos.join(" y ")} vencido</span>
      ),
    });
  }
  if (otras.length > 0) {
    partes.push({
      clave: "otras",
      nodo: <>y {otras.map(({ valor }) => valor).join(" y ")}</>,
    });
  }
  return (
    <TarjetaKpi
      titulo={titulo}
      Icono={Icono}
      valor={primera?.valor ?? sinDatos}
      detalle={
        partes.length === 0 ? undefined : (
          <>
            {partes.map(({ clave, nodo }, i) => (
              <span key={clave}>
                {i > 0 ? " · " : null}
                {nodo}
              </span>
            ))}
          </>
        )
      }
    />
  );
}

export async function EncabezadoDePlata({
  activa,
  accion,
}: {
  readonly activa: Pestana;
  /** El botón principal de la pantalla, a la derecha del título. */
  readonly accion?: ReactNode;
}) {
  const { tablero, cobros, pagos } = armado();
  const [datos, porCobrar, porPagar] = await Promise.all([
    tablero.tablero({}),
    cobros.porCobrar({}),
    pagos.pendientes(),
  ]);
  const contadores: Partial<Record<Pestana, number>> = {
    "por-cobrar": porCobrar.filas.length,
    "por-pagar": porPagar.length,
  };
  const cero = (moneda: string) => `${moneda} 0,00`;
  const delMes = datos.delMes;
  return (
    <header className="flex flex-col gap-5">
      <div className="aparece flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-tight">
            Plata
          </h1>
          <p className="m-0 mt-1 text-texto-2">
            Lo que hay que cobrar, lo que hay que pagar y lo que ya se movió.
          </p>
        </div>
        {accion}
      </div>

      <div className="aparece grid grid-cols-1 gap-4 [--orden:1] sm:grid-cols-2 xl:grid-cols-4">
        <MetricaDePlata
          titulo="Por cobrar"
          Icono={HandCoins}
          sinDatos={cero("ARS")}
          lineas={datos.pendientes
            .filter((p) => hayImporte(p.porCobrar.valor))
            .map((p) => ({
              valor: p.porCobrar.valor,
              vencido: p.porCobrarVencido.valor,
            }))}
        />
        <MetricaDePlata
          titulo="Por pagar"
          Icono={Wallet}
          sinDatos={cero("ARS")}
          lineas={datos.pendientes
            .filter((p) => hayImporte(p.porPagar.valor))
            .map((p) => ({
              valor: p.porPagar.valor,
              vencido: p.porPagarVencido.valor,
            }))}
        />
        <MetricaDePlata
          titulo={`Cobrado en ${datos.mes.nombre}`}
          Icono={PiggyBank}
          sinDatos={cero("ARS")}
          lineas={delMes
            .filter((m) => hayImporte(m.cobrado.valor))
            .map((m) => ({ valor: m.cobrado.valor, vencido: cero(m.moneda) }))}
        />
        <MetricaDePlata
          titulo={`Pagado en ${datos.mes.nombre}`}
          Icono={Wallet}
          sinDatos={cero("ARS")}
          lineas={delMes
            .filter((m) => hayImporte(m.pagado.valor))
            .map((m) => ({ valor: m.pagado.valor, vencido: cero(m.moneda) }))}
        />
      </div>

      <nav
        aria-label="Plata"
        className="aparece -mx-4 overflow-x-auto border-b border-borde px-4 [--orden:2] [scrollbar-width:none] md:mx-0 md:px-0"
      >
        <ul className="m-0 flex list-none gap-1 p-0">
          {PESTANAS.map(({ id, texto, href }) => {
            const esLaActiva = id === activa;
            const contador = contadores[id];
            return (
              <li key={id} className="shrink-0">
                <Enlace
                  href={href}
                  aria-current={esLaActiva ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap no-underline hover:text-texto",
                    esLaActiva
                      ? "border-acento text-texto"
                      : "border-transparent text-texto-2",
                  )}
                >
                  {texto}
                  {contador === undefined || contador === 0 ? null : (
                    <span className="cifras rounded-full bg-superficie-3 px-1.5 text-xs text-texto-2">
                      {contador}
                    </span>
                  )}
                </Enlace>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
