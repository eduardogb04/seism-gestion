import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  FileText,
  HandCoins,
  type LucideIcon,
  PauseCircle,
  PlayCircle,
  Receipt,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  Avisos,
  EntradaDelCalendario,
} from "../../casos-uso/calendario/calendario.ts";
import type { Cifra } from "../../casos-uso/tablero/convertido.ts";
import type { Tablero } from "../../casos-uso/tablero/tablero.ts";
import {
  type Embudo,
  ETAPAS_DEL_EMBUDO,
  NOMBRES_DE_ETAPA,
} from "../../server/inicio.ts";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { EtapaDeRenovacion } from "../_ui/etapa-de-renovacion.tsx";
import {
  distancia,
  fechaCorta,
  fechaLarga,
  nombreDe,
  partirImporte,
  saludo,
  sinCentavos,
  variacion,
} from "./formato.ts";
import { GraficoDoceMeses } from "./grafico-doce-meses.tsx";

const COLOR_ETAPA: Record<string, string> = {
  creado: "bg-etapa-creado",
  cotizado: "bg-etapa-cotizado",
  adjudicado: "bg-etapa-adjudicado",
  en_ejecucion: "bg-etapa-ejecucion",
  finalizado: "bg-etapa-finalizado",
  cerrado: "bg-etapa-cerrado",
};

const aNumero = (valor: string) =>
  Number(partirImporte(valor).numero.replace(/\./g, "").replace(",", ".")) || 0;

function Tarjeta({
  titulo,
  accion,
  children,
  className,
  orden = 0,
}: {
  readonly titulo?: ReactNode;
  readonly accion?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly orden?: number;
}) {
  return (
    <section
      style={{ "--orden": orden } as React.CSSProperties}
      className={cn(
        "aparece min-w-0 rounded-tarjeta border border-borde bg-superficie shadow-tarjeta",
        className,
      )}
    >
      {titulo ? (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 className="m-0 text-[15px] font-semibold">{titulo}</h2>
          {accion}
        </header>
      ) : null}
      {children}
    </section>
  );
}

function Importe({
  valor,
  grande = false,
}: {
  readonly valor: string;
  readonly grande?: boolean;
}) {
  const { moneda, numero } = partirImporte(valor);
  return (
    <span className="cifras inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          "font-medium text-texto-3",
          grande ? "text-sm" : "text-xs",
        )}
      >
        {moneda}
      </span>
      <span
        className={cn(
          "font-semibold tracking-tight text-texto",
          grande ? "text-[28px] leading-8" : "text-sm",
        )}
      >
        {grande ? sinCentavos(numero) : numero}
      </span>
    </span>
  );
}

function Tendencia({
  valores,
  className,
}: {
  readonly valores: readonly number[];
  readonly className?: string;
}) {
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const ancho = 96;
  const alto = 28;
  const paso = ancho / Math.max(valores.length - 1, 1);
  const y = (v: number) =>
    alto - 2 - ((v - min) / (max - min || 1)) * (alto - 4);
  const puntos = valores.map(
    (v, i) => `${(i * paso).toFixed(1)},${y(v).toFixed(1)}`,
  );
  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      className={cn("h-7 w-24 overflow-visible", className)}
      aria-hidden="true"
    >
      <polygon
        points={`0,${alto} ${puntos.join(" ")} ${ancho},${alto}`}
        fill="currentColor"
        opacity="0.08"
      />
      <polyline
        points={puntos.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={ancho}
        cy={y(valores.at(-1) ?? 0)}
        r="2.5"
        fill="currentColor"
      />
    </svg>
  );
}

function Variacion({
  porcentaje,
  inversa = false,
}: {
  readonly porcentaje: number | null;
  readonly inversa?: boolean;
}) {
  if (porcentaje === null)
    return <span className="text-xs text-texto-3">sin mes anterior</span>;
  const sube = porcentaje >= 0;
  const bueno = inversa ? !sube : sube;
  const Icono = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "cifras inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
        bueno ? "bg-exito-suave text-exito" : "bg-peligro-suave text-peligro",
      )}
    >
      <Icono aria-hidden="true" className="size-3" />
      {Math.abs(porcentaje)}%
      <span className="sr-only">
        {sube ? "más" : "menos"} que el mes anterior
      </span>
    </span>
  );
}

function Metrica({
  etiqueta,
  cifra,
  serie,
  inversa,
  pie,
  orden,
  tono = "text-acento",
}: {
  readonly etiqueta: string;
  readonly cifra: Cifra;
  readonly serie?: readonly number[];
  readonly inversa?: boolean;
  readonly pie?: ReactNode;
  readonly orden: number;
  readonly tono?: string;
}) {
  const contenido = (
    <>
      <p className="m-0 text-[13px] font-medium text-texto-2">{etiqueta}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <Importe valor={cifra.valor} grande />
        {serie ? <Tendencia valores={serie} className={tono} /> : null}
      </div>
      <div className="mt-3 flex min-h-5 items-center gap-2 text-xs text-texto-3">
        {serie ? (
          <Variacion
            porcentaje={variacion(serie.at(-1) ?? 0, serie.at(-2) ?? 0)}
            inversa={inversa ?? false}
          />
        ) : null}
        {pie}
      </div>
    </>
  );
  const clase =
    "aparece block min-w-0 rounded-tarjeta border border-borde bg-superficie p-5 text-texto no-underline shadow-tarjeta";
  return cifra.enlace ? (
    <Enlace
      href={cifra.enlace}
      style={{ "--orden": orden } as React.CSSProperties}
      className={cn(
        clase,
        "presionable hover:border-borde-fuerte hover:shadow-flota active:scale-[0.99]",
      )}
    >
      {contenido}
    </Enlace>
  ) : (
    <div style={{ "--orden": orden } as React.CSSProperties} className={clase}>
      {contenido}
    </div>
  );
}

type Tarea = {
  readonly clave: string;
  readonly Icono: LucideIcon;
  readonly titulo: string;
  readonly detalle: string;
  readonly cuando?: string;
  readonly etapa?: 60 | 45 | 30 | null | undefined;
  readonly urgencia: "vencida" | "pronto" | "normal";
  readonly accion: string;
  readonly enlace: string;
  readonly orden: number;
};

const POR_TIPO: Record<
  EntradaDelCalendario["tipo"],
  { Icono: LucideIcon; accion: string }
> = {
  factura: { Icono: HandCoins, accion: "Registrar cobro" },
  egreso: { Icono: Wallet, accion: "Registrar pago" },
  vencimiento: { Icono: CalendarClock, accion: "Cotizar renovación" },
  inicio: { Icono: PlayCircle, accion: "Ver servicio" },
  cotizacion: { Icono: FileText, accion: "Ver cotización" },
  ajuste: { Icono: FileText, accion: "Validar ajuste" },
  cuota: { Icono: HandCoins, accion: "Facturar cuota" },
};

function tareasDe(avisos: Avisos, embudo: Embudo, sinCambio: number): Tarea[] {
  const tareas: Tarea[] = avisos.entradas.map((e, i) => {
    const { Icono, accion } = POR_TIPO[e.tipo];
    return {
      clave: `${e.tipo}-${e.enlace}-${i}`,
      Icono,
      titulo: e.titulo,
      detalle: [e.importe, fechaCorta(e.fecha)].filter(Boolean).join(" · "),
      cuando: distancia(e.fecha),
      etapa: e.etapaDeRenovacion,
      urgencia: e.vencida ? "vencida" : "pronto",
      accion,
      enlace: e.enlace,
      orden: e.vencida ? 0 : 1,
    };
  });
  for (const q of embudo.quietos) {
    tareas.push({
      clave: `quieto-${q.id}`,
      Icono: PauseCircle,
      titulo: `${q.titulo} sin movimiento`,
      detalle: `${q.codigo} · ${q.cliente} · ${NOMBRES_DE_ETAPA[q.estado]}`,
      cuando: `${q.dias} días`,
      urgencia: "normal",
      accion: "Ver servicio",
      enlace: `/servicios/${q.id}`,
      orden: 2,
    });
  }
  if (sinCambio > 0) {
    tareas.push({
      clave: "sin-cambio",
      Icono: TriangleAlert,
      titulo:
        sinCambio === 1
          ? "1 documento sin tipo de cambio"
          : `${sinCambio} documentos sin tipo de cambio`,
      detalle: "No entran en las sumas hasta que lo cargues",
      urgencia: "normal",
      accion: "Completar",
      enlace: "/sin-tipo-de-cambio",
      orden: 3,
    });
  }
  return tareas.sort((a, b) => a.orden - b.orden);
}

const TONO: Record<Tarea["urgencia"], string> = {
  vencida: "bg-peligro-suave text-peligro",
  pronto: "bg-aviso-suave text-aviso",
  normal: "bg-superficie-2 text-texto-2",
};

function ParaHoy({
  tareas,
  enlaceCalendario,
}: {
  readonly tareas: readonly Tarea[];
  readonly enlaceCalendario: string;
}) {
  const visibles = tareas.slice(0, 7);
  return (
    <Tarjeta
      titulo="Para hoy"
      orden={1}
      className="lg:col-span-2"
      accion={
        <Enlace
          href={enlaceCalendario}
          className="text-[13px] font-medium no-underline hover:underline"
        >
          Ver calendario
        </Enlace>
      }
    >
      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <CircleCheck
            aria-hidden="true"
            className="size-8 text-exito"
            strokeWidth={1.5}
          />
          <p className="m-0 font-medium">Nada pendiente</p>
          <p className="m-0 text-texto-2">
            No hay cobros, pagos ni vencimientos que atender.
          </p>
        </div>
      ) : (
        <ul className="m-0 list-none px-2 pb-2">
          {visibles.map((t) => (
            <li key={t.clave}>
              <Enlace
                href={t.enlace}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-texto no-underline transition-colors duration-150 hover:bg-superficie-2"
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    TONO[t.urgencia],
                  )}
                >
                  <t.Icono
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={1.75}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.titulo}</span>
                  <span className="cifras block truncate text-[13px] text-texto-3">
                    {t.detalle}
                  </span>
                  <EtapaDeRenovacion etapa={t.etapa} />
                </span>
                {t.cuando ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1 py-0.5 text-xs font-medium sm:px-2",
                      t.urgencia === "vencida"
                        ? "text-peligro"
                        : t.urgencia === "pronto"
                          ? "text-aviso"
                          : "text-texto-3",
                    )}
                  >
                    {t.cuando}
                  </span>
                ) : null}
                <span className="presionable hidden shrink-0 rounded-md border border-borde bg-superficie px-2.5 py-1 text-[13px] sm:inline font-medium text-texto-2 shadow-tarjeta group-hover:border-borde-fuerte group-hover:text-texto">
                  {t.accion}
                </span>
              </Enlace>
            </li>
          ))}
          {tareas.length > visibles.length ? (
            <li className="px-3 pt-1 pb-2 text-[13px] text-texto-3">
              Y {tareas.length - visibles.length} más en el calendario.
            </li>
          ) : null}
        </ul>
      )}
    </Tarjeta>
  );
}

function Pendiente({
  titulo,
  Icono,
  total,
  vencido,
  orden,
}: {
  readonly titulo: string;
  readonly Icono: LucideIcon;
  readonly total: Cifra;
  readonly vencido: Cifra;
  readonly orden: number;
}) {
  const t = aNumero(total.valor);
  const v = aNumero(vencido.valor);
  const parte = t > 0 ? Math.min(100, (v / t) * 100) : 0;
  const cuerpo = (
    <>
      <p className="m-0 flex items-center gap-2 text-[13px] font-medium text-texto-2">
        <Icono
          aria-hidden="true"
          className="size-4 text-texto-3"
          strokeWidth={1.75}
        />
        {titulo}
      </p>
      <div className="mt-2">
        <Importe valor={total.valor} grande />
      </div>
      <div
        className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-superficie-3"
        aria-hidden="true"
      >
        <div className="bg-peligro" style={{ width: `${parte}%` }} />
        <div className="flex-1 bg-acento/70" />
      </div>
      <p className="mt-2 mb-0 flex items-center justify-between text-xs text-texto-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-peligro" aria-hidden="true" />
          Vencido{" "}
          <span className="cifras text-texto-2">
            {sinCentavos(vencido.valor)}
          </span>
        </span>
        <span className="cifras">{Math.round(parte)}%</span>
      </p>
    </>
  );
  const clase =
    "aparece block min-w-0 rounded-tarjeta border border-borde bg-superficie p-5 text-texto no-underline shadow-tarjeta";
  return total.enlace ? (
    <Enlace
      href={total.enlace}
      style={{ "--orden": orden } as React.CSSProperties}
      className={cn(
        clase,
        "presionable hover:border-borde-fuerte hover:shadow-flota active:scale-[0.99]",
      )}
    >
      {cuerpo}
    </Enlace>
  ) : (
    <div style={{ "--orden": orden } as React.CSSProperties} className={clase}>
      {cuerpo}
    </div>
  );
}

function EmbudoDeServicios({ embudo }: { readonly embudo: Embudo }) {
  const max = Math.max(...ETAPAS_DEL_EMBUDO.map((e) => embudo.porEtapa[e]), 1);
  const total = ETAPAS_DEL_EMBUDO.reduce((s, e) => s + embudo.porEtapa[e], 0);
  return (
    <Tarjeta
      titulo="Servicios por etapa"
      orden={7}
      accion={
        <span className="cifras text-[13px] text-texto-3">{total} vivos</span>
      }
    >
      <div
        className="mx-5 mt-1 mb-4 flex h-2 gap-0.5 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        {ETAPAS_DEL_EMBUDO.filter((e) => embudo.porEtapa[e] > 0).map((e) => (
          <div
            key={e}
            className={COLOR_ETAPA[e]}
            style={{ flexGrow: embudo.porEtapa[e] }}
          />
        ))}
      </div>
      <ul className="m-0 list-none px-2 pb-2">
        {ETAPAS_DEL_EMBUDO.map((e) => (
          <li key={e}>
            <Enlace
              href={`/servicios?estado=${e}`}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-texto no-underline transition-colors hover:bg-superficie-2"
            >
              <span
                className={cn("size-2 shrink-0 rounded-full", COLOR_ETAPA[e])}
                aria-hidden="true"
              />
              <span className="w-28 shrink-0 text-[13px] text-texto-2 group-hover:text-texto">
                {NOMBRES_DE_ETAPA[e]}
              </span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-superficie-2">
                <span
                  className={cn(
                    "block h-full rounded-full opacity-60",
                    COLOR_ETAPA[e],
                  )}
                  style={{ width: `${(embudo.porEtapa[e] / max) * 100}%` }}
                />
              </span>
              <span className="cifras w-6 text-right text-[13px] font-medium">
                {embudo.porEtapa[e]}
              </span>
            </Enlace>
          </li>
        ))}
      </ul>
      {embudo.salidas > 0 ? (
        <p className="m-0 border-t border-borde px-5 py-3 text-xs text-texto-3">
          {embudo.salidas} perdidos, sin respuesta o cancelados
        </p>
      ) : null}
    </Tarjeta>
  );
}

function Selectores({ tablero }: { readonly tablero: Tablero }) {
  const { mes, convertido } = tablero;
  const url = (m: string, moneda: string) =>
    `/?${new URLSearchParams({ mes: m, moneda })}`;
  const flecha =
    "presionable grid size-8 place-items-center rounded-md text-texto-2 no-underline hover:bg-superficie-2 hover:text-texto";
  return (
    <div className="flex items-center gap-2">
      <nav
        aria-label="Moneda"
        className="flex rounded-lg border border-borde bg-superficie-2 p-0.5"
      >
        {(["ARS", "USD"] as const).map((m) => (
          <Enlace
            key={m}
            href={url(mes.mes, m)}
            aria-current={m === convertido.moneda ? "true" : undefined}
            className="rounded-md px-2.5 py-1 text-[13px] font-medium text-texto-3 no-underline transition-colors aria-[current=true]:bg-superficie aria-[current=true]:text-texto aria-[current=true]:shadow-tarjeta"
          >
            {m}
          </Enlace>
        ))}
      </nav>
      <div className="flex items-center rounded-lg border border-borde bg-superficie shadow-tarjeta">
        <Enlace
          href={url(mes.anterior, convertido.moneda)}
          className={flecha}
          aria-label="Mes anterior"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Enlace>
        <span className="min-w-32 px-1 text-center text-[13px] font-medium first-letter:uppercase">
          {mes.nombre}
        </span>
        <Enlace
          href={url(mes.siguiente, convertido.moneda)}
          className={flecha}
          aria-label="Mes siguiente"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Enlace>
      </div>
    </div>
  );
}

export function Inicio({
  email,
  tablero,
  avisos,
  embudo,
}: {
  readonly email: string;
  readonly tablero: Tablero;
  readonly avisos: Avisos;
  readonly embudo: Embudo;
}) {
  const c = tablero.convertido;
  const tareas = tareasDe(avisos, embudo, c.sinCambio);
  const vencidas = tareas.filter((t) => t.urgencia === "vencida").length;
  const facturado = c.meses.map((m) => m.facturado);
  const egresos = c.meses.map((m) => m.egresos);
  const resultado = c.meses.map((m) => m.facturado - m.egresos);
  const fact = aNumero(c.facturado.valor);
  const cobradoPct =
    fact > 0
      ? Math.min(100, Math.round((aNumero(c.cobrado.valor) / fact) * 100))
      : 0;

  const resumen =
    tareas.length === 0
      ? "Está todo al día."
      : `Tenés ${tareas.length} ${tareas.length === 1 ? "cosa" : "cosas"} para atender${
          vencidas > 0
            ? `, ${vencidas} ${vencidas === 1 ? "vencida" : "vencidas"}`
            : ""
        }.`;

  return (
    <div className="flex flex-col gap-6">
      <header className="aparece flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[13px] text-texto-3">{fechaLarga()}</p>
          <h1 className="m-0 mt-1 text-[28px] leading-9 font-semibold tracking-tight">
            {saludo()}, {nombreDe(email)}
          </h1>
          <p className="m-0 mt-1 text-texto-2">{resumen}</p>
        </div>
        <Selectores tablero={tablero} />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ParaHoy tareas={tareas} enlaceCalendario={avisos.enlace} />
        <div className="grid min-w-0 gap-4">
          <Pendiente
            titulo="Por cobrar"
            Icono={HandCoins}
            total={c.porCobrar}
            vencido={c.porCobrarVencido}
            orden={2}
          />
          <Pendiente
            titulo="Por pagar"
            Icono={Wallet}
            total={c.porPagar}
            vencido={c.porPagarVencido}
            orden={3}
          />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[15px] font-semibold">
          El mes en números{" "}
          <span className="font-normal text-texto-3">
            · {tablero.mes.nombre}
          </span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metrica
            etiqueta="Facturado"
            cifra={c.facturado}
            serie={facturado}
            orden={4}
          />
          <Metrica
            etiqueta="Cobrado"
            cifra={c.cobrado}
            orden={5}
            pie={
              <span className="flex w-full items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-superficie-3">
                  <span
                    className="block h-full rounded-full bg-exito"
                    style={{ width: `${cobradoPct}%` }}
                  />
                </span>
                <span className="cifras">{cobradoPct}% de lo facturado</span>
              </span>
            }
          />
          <Metrica
            etiqueta="Egresos"
            cifra={c.egresos}
            serie={egresos}
            inversa
            orden={6}
            tono="text-aviso"
          />
          <Metrica
            etiqueta="Resultado"
            cifra={c.resultadoDevengado}
            serie={resultado}
            orden={7}
            tono={
              aNumero(c.resultadoDevengado.valor) >= 0
                ? "text-exito"
                : "text-peligro"
            }
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Tarjeta
          titulo="Doce meses"
          orden={8}
          className="lg:col-span-2"
          accion={
            <span className="flex items-center gap-4 text-xs text-texto-3">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-sm bg-serie-1"
                  aria-hidden="true"
                />{" "}
                Facturado
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-sm bg-serie-2"
                  aria-hidden="true"
                />{" "}
                Egresos
              </span>
            </span>
          }
        >
          <div className="px-3 pb-4">
            <GraficoDoceMeses meses={c.meses} moneda={c.moneda} />
          </div>
        </Tarjeta>
        <EmbudoDeServicios embudo={embudo} />
      </div>

      <p className="m-0 flex items-center gap-1.5 text-xs text-texto-3">
        <Receipt aria-hidden="true" className="size-3.5" />
        Montos convertidos a {c.moneda === "ARS" ? "pesos" : "dólares"} con el
        último tipo de cambio cargado a cada fecha.
      </p>
    </div>
  );
}
