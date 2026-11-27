/**
 * El calendario (F4-04, ADR 0046): lo que vence o empieza en un mes, como
 * grilla (Mes) o como lista por día (Agenda). `?mes=aaaa-mm`, `?vista=`,
 * `?tipo=` (uno o varios) y `?evento=<clave>` (el panel de una entrada). Sin
 * `?vista=` elige el ancho: Mes desde 768 px, Agenda en el celular. HTML del
 * servidor, sin JavaScript de cliente.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { fechaHoraLocalDe } from "../../adaptadores/reloj/sistema.ts";
import { EGRESOS } from "../../casos-uso/abm/egresos.ts";
import {
  type EntradaDelCalendario,
  ETIQUETAS_DE_TIPO,
  TIPOS_DE_ENTRADA,
  type TipoDeEntrada,
} from "../../casos-uso/calendario/calendario.ts";
import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../casos-uso/servicios/servicios.ts";
import { formatearISO } from "../../dominio/compartido/reloj.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { FilaDeFiltros, FiltroEnlace, Vacio } from "../_plata/piezas.tsx";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { Marco } from "../_ui/marco.tsx";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import { VentanaDeRenovacion } from "../servicios/[id]/ventana-de-renovacion.tsx";
import { Agenda } from "./agenda.tsx";
import {
  claveDeEntrada,
  type Estado,
  enlaceDelCalendario,
  PUNTO_DE_TIPO,
  type Vista,
} from "./eventos.ts";
import { GrillaDelMes } from "./grilla.tsx";
import { VentanaDeEvento } from "./ventana-de-evento.tsx";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/calendario";

const BOTON_DE_NAVEGACION =
  "presionable grid size-9 place-items-center rounded-control border border-borde bg-superficie text-texto-2 no-underline shadow-tarjeta hover:border-borde-fuerte hover:text-texto pointer-coarse:size-11";

const texto = (valor: string | string[] | undefined): string | undefined =>
  typeof valor === "string" ? valor : undefined;

export default async function Calendario({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const { calendario } = armado();
  const { mes, tipos, entradas, semanas } = await calendario.mes(parametros);
  const { email, rol } = sesion.usuario;
  const puedeRenovar = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const hoy = formatearISO(fechaHoraLocalDe(new Date())).slice(0, 10);
  const vistaPedida = texto(parametros.vista);
  const vista: Vista | null =
    vistaPedida === "mes" || vistaPedida === "agenda" ? vistaPedida : null;
  const estado: Estado = { mes: mes.mes, vista, tipos };

  // Lo vencido es de cualquier mes: la agenda lo junta arriba.
  let vencidas: readonly EntradaDelCalendario[];
  try {
    vencidas = (await calendario.avisos()).entradas.filter(
      (e) => e.vencida && tipos.includes(e.tipo),
    );
  } catch {
    vencidas = entradas.filter((e) => e.vencida);
  }
  const proximas = entradas.filter((e) => !e.vencida);

  const abierta = [...vencidas, ...entradas].find(
    (e) => claveDeEntrada(e) === texto(parametros.evento),
  );
  const aRenovar = puedeRenovar
    ? entradas.find(
        ({ vencimiento }) =>
          vencimiento !== null && vencimiento.id === parametros.renovar,
      )
    : undefined;
  const enlaceDeRenovacion = puedeRenovar
    ? (vencimientoId: string) =>
        enlaceDelCalendario(estado, { renovar: vencimientoId })
    : null;

  const alternar = (tipo: TipoDeEntrada): readonly TipoDeEntrada[] => {
    const elegidos = tipos.includes(tipo)
      ? tipos.filter((t) => t !== tipo)
      : [...tipos, tipo];
    return elegidos.length === 0 ? TIPOS_DE_ENTRADA : elegidos;
  };
  const hayFiltro = tipos.length < TIPOS_DE_ENTRADA.length;
  const mesDeHoy = hoy.slice(0, 7);
  const verMes = vista === null || vista === "mes";
  const verAgenda = vista === null || vista === "agenda";
  const sinNada = entradas.length === 0 && vencidas.length === 0;

  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main className="flex flex-col gap-5">
        <header className="aparece flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-tight">
              Calendario
            </h1>
            <p className="m-0 mt-1 text-texto-2">
              Vencimientos, cobros, pagos e inicios, mes por mes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Meses" className="flex items-center gap-2">
              <Enlace
                href={enlaceDelCalendario({ ...estado, mes: mes.anterior })}
                aria-label="Mes anterior"
                className={BOTON_DE_NAVEGACION}
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Enlace>
              <p className="m-0 min-w-36 text-center text-[15px] font-semibold first-letter:uppercase">
                {mes.nombre}
              </p>
              <Enlace
                href={enlaceDelCalendario({ ...estado, mes: mes.siguiente })}
                aria-label="Mes siguiente"
                className={BOTON_DE_NAVEGACION}
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </Enlace>
              <Enlace
                href={enlaceDelCalendario({ ...estado, mes: mesDeHoy })}
                className="presionable inline-flex h-9 items-center rounded-control border border-borde-fuerte bg-superficie px-3 text-sm font-medium text-texto no-underline shadow-tarjeta hover:bg-superficie-2 pointer-coarse:h-11"
              >
                Hoy
              </Enlace>
            </nav>
            <nav
              aria-label="Vista"
              className="flex rounded-control border border-borde bg-superficie-2 p-0.5"
            >
              {(["mes", "agenda"] as const).map((v) => {
                const activa = vista === v;
                return (
                  <Enlace
                    key={v}
                    href={enlaceDelCalendario({ ...estado, vista: v })}
                    aria-current={activa ? "page" : undefined}
                    className={cn(
                      "inline-flex h-8 items-center rounded px-3 text-sm font-medium no-underline pointer-coarse:h-10",
                      activa
                        ? "bg-superficie text-texto shadow-tarjeta"
                        : "text-texto-2 hover:text-texto",
                    )}
                  >
                    {v === "mes" ? "Mes" : "Agenda"}
                  </Enlace>
                );
              })}
            </nav>
          </div>
        </header>

        <FilaDeFiltros>
          <FiltroEnlace
            href={enlaceDelCalendario({ ...estado, tipos: TIPOS_DE_ENTRADA })}
            activo={!hayFiltro}
          >
            Todos
          </FiltroEnlace>
          {TIPOS_DE_ENTRADA.map((tipo) => {
            const activo = hayFiltro && tipos.includes(tipo);
            return (
              <FiltroEnlace
                key={tipo}
                href={enlaceDelCalendario({
                  ...estado,
                  tipos: hayFiltro ? alternar(tipo) : [tipo],
                })}
                activo={activo}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", PUNTO_DE_TIPO[tipo])}
                />
                {ETIQUETAS_DE_TIPO[tipo]}
              </FiltroEnlace>
            );
          })}
        </FilaDeFiltros>

        {sinNada && verAgenda && !verMes ? (
          <Vacio titulo="No hay nada para este mes" />
        ) : null}
        {verMes ? (
          <div className={cn(vista === null && "hidden md:block")}>
            <GrillaDelMes semanas={semanas} estado={estado} hoy={hoy} />
          </div>
        ) : null}
        {verAgenda && !(sinNada && !verMes) ? (
          <div className={cn(vista === null && "md:hidden")}>
            {sinNada ? (
              <Vacio titulo="No hay nada para este mes" />
            ) : (
              <Agenda
                vencidas={vencidas}
                proximas={proximas}
                estado={estado}
                hoy={hoy}
              />
            )}
          </div>
        ) : null}

        {abierta === undefined ? null : (
          <VentanaDeEvento
            entrada={abierta}
            rutaAlCerrar={enlaceDelCalendario(estado)}
            puedeCobrar={puedeRenovar}
            puedePagar={EGRESOS.rolesQueEscriben.includes(rol)}
            enlaceDeRenovacion={enlaceDeRenovacion}
          />
        )}
        {aRenovar?.vencimiento ? (
          <VentanaDeRenovacion
            servicioId={aRenovar.vencimiento.servicioId}
            vencimientoId={aRenovar.vencimiento.id}
            detalle={aRenovar.titulo}
            rutaAlCerrar={enlaceDelCalendario(estado)}
          />
        ) : null}
      </main>
    </Marco>
  );
}
