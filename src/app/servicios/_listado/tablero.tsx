"use client";

/**
 * El tablero de servicios: una columna por etapa viva y, plegadas a la
 * derecha, Cerrado y las salidas. En celular se ve una columna por vez.
 *
 * Arrastrar una tarjeta (con mouse) a la etapa siguiente no cambia el estado:
 * lleva al paso que corresponde en el detalle (cargar la cotización, la orden
 * de compra, confirmar el inicio o el fin). Cualquier otro destino explica por
 * qué no y no hace nada. Con teclado, la tarjeta abre el detalle, donde están
 * las mismas acciones.
 */

import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { useRouter } from "next/navigation.js";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { EstadoServicio } from "../../../dominio/servicios/estados.ts";
import type { ServicioDelListado } from "../../../server/servicios.ts";
import { cn } from "../../_ui/cn.ts";
import { NOMBRE_DE_ETAPA, PuntoDeEtapa } from "../../_ui/etapa.tsx";
import { ETAPAS_PLEGADAS, ETAPAS_VIVAS, esViva } from "./etapas.ts";
import { TarjetaDeServicio } from "./piezas.tsx";

export type ColumnaDelTablero = {
  readonly etapa: EstadoServicio;
  readonly servicios: readonly ServicioDelListado[];
  /** Una línea por moneda; vacío si nada tiene importe. */
  readonly totales: readonly string[];
};

const PLEGADAS = "plegadas";

/** El paso que lleva de una etapa viva a la siguiente, en el panel de la actual. */
const PASO: Partial<
  Record<EstadoServicio, { readonly consulta: string; readonly texto: string }>
> = {
  creado: {
    consulta: "cotizacion=1",
    texto: "Cargá la cotización: al guardarla pasa a Cotizado.",
  },
  cotizado: {
    consulta: "orden=1",
    texto: "Cargá la orden de compra: al guardarla pasa a Adjudicado.",
  },
  adjudicado: {
    consulta: "pasar=en_ejecucion",
    texto: "Confirmá el inicio para pasarlo a En ejecución.",
  },
  en_ejecucion: {
    consulta: "pasar=finalizado",
    texto: "Confirmá que terminó para pasarlo a Finalizado.",
  },
};

const ACCION_AL_SOLTAR: Partial<Record<EstadoServicio, string>> = {
  cotizado: "Soltá para cargar la cotización",
  adjudicado: "Soltá para cargar la orden de compra",
  en_ejecucion: "Soltá para confirmar el inicio",
  finalizado: "Soltá para confirmar el fin",
};

function siguienteDe(etapa: EstadoServicio): EstadoServicio | null {
  const i = (ETAPAS_VIVAS as readonly EstadoServicio[]).indexOf(etapa);
  return i === -1 ? null : (ETAPAS_VIVAS[i + 1] ?? null);
}

type Destino = EstadoServicio | typeof PLEGADAS;

/** Qué pasa al soltar `servicio` en `destino`: a dónde ir, o por qué no. */
function resolver(
  servicio: ServicioDelListado,
  destino: Destino,
):
  | { readonly ir: string; readonly texto: string }
  | { readonly motivo: string }
  | null {
  const { etapa } = servicio;
  if (destino === etapa) return null;
  if (destino === PLEGADAS) {
    return etapa === "finalizado"
      ? {
          motivo:
            "Pasa a Cerrado solo, cuando se cobra todo lo facturado. Registrá los cobros en el detalle.",
        }
      : {
          motivo:
            "Para darlo por perdido, sin respuesta o cancelado, abrilo y elegí la salida: pide un motivo.",
        };
  }
  const siguiente = siguienteDe(etapa);
  const paso = PASO[etapa];
  if (destino === siguiente && paso) {
    return { ir: `${servicio.enlace}?${paso.consulta}`, texto: paso.texto };
  }
  const vivas = ETAPAS_VIVAS as readonly EstadoServicio[];
  if (vivas.indexOf(destino) < vivas.indexOf(etapa)) {
    return {
      motivo:
        etapa === "adjudicado" && destino === "cotizado"
          ? "Vuelve a Cotizado si anulás la orden de compra, desde el detalle."
          : "Un servicio no vuelve a una etapa anterior.",
    };
  }
  return {
    motivo: `No se saltean etapas: primero tiene que pasar a ${NOMBRE_DE_ETAPA[siguiente ?? etapa]}.`,
  };
}

type Arrastre = {
  readonly servicio: ServicioDelListado;
  readonly elemento: HTMLElement;
  readonly x: number;
  readonly y: number;
  activo: boolean;
  readonly limpiar: () => void;
};

function sinMovimiento(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Tablero({
  columnas,
  plegadas,
  inicial,
  arrastrable,
}: {
  readonly columnas: readonly ColumnaDelTablero[];
  readonly plegadas: readonly ColumnaDelTablero[];
  /** La columna que se ve primero en celular. */
  readonly inicial: EstadoServicio;
  readonly arrastrable: boolean;
}) {
  const router = useRouter();
  const [activa, setActiva] = useState<Destino>(
    esViva(inicial) ? inicial : PLEGADAS,
  );
  const [abiertas, setAbiertas] = useState(!esViva(inicial));
  const [arrastrando, setArrastrando] = useState<ServicioDelListado | null>(
    null,
  );
  const [encima, setEncima] = useState<Destino | null>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const totalPlegadas = plegadas.reduce((s, c) => s + c.servicios.length, 0);

  useEffect(() => {
    if (!arrastrando) return;
    document.documentElement.classList.add("cursor-grabbing");
    return () => document.documentElement.classList.remove("cursor-grabbing");
  }, [arrastrando]);

  function destinoBajo(x: number, y: number): Destino | null {
    const columna = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-columna]");
    return (columna?.dataset.columna as Destino | undefined) ?? null;
  }

  function soltar(elemento: HTMLElement, animar: boolean) {
    elemento.style.pointerEvents = "";
    // La columna de origen (con su animación de entrada) es un contexto de
    // apilado: se levantó al empezar y baja cuando la tarjeta ya volvió.
    const columna = elemento.closest<HTMLElement>("[data-columna]");
    const bajar = () => {
      elemento.style.transition = "";
      elemento.style.zIndex = "";
      if (columna) columna.style.zIndex = "";
    };
    const conAnimacion = animar && !sinMovimiento();
    if (conAnimacion) {
      elemento.style.transition =
        "translate 200ms ease-out, scale 200ms ease-out";
      elemento.addEventListener("transitionend", bajar, { once: true });
    }
    elemento.style.translate = "";
    elemento.style.scale = "";
    if (!conAnimacion) {
      bajar();
    }
  }

  function terminar(x: number, y: number, cancelado: boolean) {
    const actual = arrastre.current;
    arrastre.current = null;
    actual?.limpiar();
    if (!actual?.activo) return;
    if (!cancelado) {
      // El clic que sigue al soltar abriría el detalle.
      const tragar = (evento: MouseEvent) => {
        evento.preventDefault();
        evento.stopPropagation();
      };
      window.addEventListener("click", tragar, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", tragar, true), 0);
    }
    setArrastrando(null);
    setEncima(null);
    const destino = cancelado ? null : destinoBajo(x, y);
    const resultado = destino ? resolver(actual.servicio, destino) : null;
    soltar(actual.elemento, !(resultado && "ir" in resultado));
    if (resultado === null) return;
    if ("ir" in resultado) {
      toast(resultado.texto);
      router.push(resultado.ir);
    } else {
      toast(resultado.motivo, {
        action: {
          label: "Abrir",
          onClick: () => router.push(actual.servicio.enlace),
        },
      });
    }
  }

  function mover(evento: globalThis.PointerEvent) {
    const actual = arrastre.current;
    if (!actual) return;
    const dx = evento.clientX - actual.x;
    const dy = evento.clientY - actual.y;
    if (!actual.activo) {
      if (Math.hypot(dx, dy) < 6) return;
      actual.activo = true;
      actual.elemento.style.pointerEvents = "none";
      actual.elemento.style.zIndex = "30";
      actual.elemento.style.scale = "1.02";
      const columna = actual.elemento.closest<HTMLElement>("[data-columna]");
      if (columna) columna.style.zIndex = "20";
      setArrastrando(actual.servicio);
    }
    actual.elemento.style.translate = `${dx}px ${dy}px`;
    setEncima(destinoBajo(evento.clientX, evento.clientY));
  }

  function empezar(
    evento: PointerEvent<HTMLElement>,
    servicio: ServicioDelListado,
  ) {
    if (
      !arrastrable ||
      evento.pointerType !== "mouse" ||
      evento.button !== 0 ||
      arrastre.current
    ) {
      return;
    }
    const elemento = (evento.target as HTMLElement).closest<HTMLElement>(
      "[data-servicio]",
    );
    if (!elemento) return;
    elemento.style.transition = "";
    const alSoltar = (e: globalThis.PointerEvent) =>
      terminar(e.clientX, e.clientY, false);
    const alCancelar = () => terminar(0, 0, true);
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") terminar(0, 0, true);
    };
    arrastre.current = {
      servicio,
      elemento,
      x: evento.clientX,
      y: evento.clientY,
      activo: false,
      limpiar: () => {
        document.removeEventListener("pointermove", mover);
        document.removeEventListener("pointerup", alSoltar);
        document.removeEventListener("pointercancel", alCancelar);
        document.removeEventListener("keydown", alTeclear);
      },
    };
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", alSoltar);
    document.addEventListener("pointercancel", alCancelar);
    document.addEventListener("keydown", alTeclear);
  }

  const valido = arrastrando ? siguienteDe(arrastrando.etapa) : null;

  return (
    <div className="flex flex-col gap-3">
      <nav
        aria-label="Etapas"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:hidden"
      >
        {[
          ...columnas.map((c) => ({ clave: c.etapa as Destino, c })),
          {
            clave: PLEGADAS as Destino,
            c: null,
          },
        ].map(({ clave, c }) => (
          <button
            key={clave}
            type="button"
            aria-pressed={activa === clave}
            onClick={() => {
              setActiva(clave);
              if (clave === PLEGADAS) setAbiertas(true);
            }}
            className="presionable inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-borde bg-superficie px-3.5 text-[13px] font-medium text-texto-2 aria-pressed:border-texto aria-pressed:bg-texto aria-pressed:text-fondo"
          >
            {c ? <PuntoDeEtapa etapa={c.etapa} /> : null}
            {c ? NOMBRE_DE_ETAPA[c.etapa] : "Cerrados y salidas"}
            <span className="cifras opacity-70">
              {c ? c.servicios.length : totalPlegadas}
            </span>
          </button>
        ))}
      </nav>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
        <div className="flex gap-3">
          {columnas.map((columna, i) => (
            <Columna
              key={columna.etapa}
              columna={columna}
              orden={i}
              visible={activa === columna.etapa}
              estado={
                !arrastrando || arrastrando.etapa === columna.etapa
                  ? "quieta"
                  : columna.etapa === valido
                    ? encima === columna.etapa
                      ? "destino-encima"
                      : "destino"
                    : encima === columna.etapa
                      ? "invalida-encima"
                      : "quieta"
              }
              accion={ACCION_AL_SOLTAR[columna.etapa]}
            >
              {columna.servicios.map((s) => (
                <li key={s.id} onPointerDown={(e) => empezar(e, s)}>
                  <TarjetaDeServicio
                    servicio={s}
                    arrastrable={arrastrable}
                    className={cn(
                      arrastrando?.id === s.id &&
                        "shadow-flota ring-1 ring-acento/40",
                    )}
                  />
                </li>
              ))}
            </Columna>
          ))}
          <ColumnaPlegada
            plegadas={plegadas}
            total={totalPlegadas}
            abiertas={abiertas}
            alternar={() => setAbiertas((a) => !a)}
            visible={activa === PLEGADAS}
            resaltada={arrastrando !== null && encima === PLEGADAS}
          />
        </div>
      </div>
    </div>
  );
}

type EstadoDeColumna =
  | "quieta"
  | "destino"
  | "destino-encima"
  | "invalida-encima";

function Columna({
  columna,
  orden,
  visible,
  estado,
  accion,
  children,
}: {
  readonly columna: ColumnaDelTablero;
  readonly orden: number;
  readonly visible: boolean;
  readonly estado: EstadoDeColumna;
  readonly accion: string | undefined;
  readonly children: React.ReactNode;
}) {
  const { etapa, servicios, totales } = columna;
  return (
    <section
      aria-labelledby={`columna-${etapa}`}
      data-columna={etapa}
      style={{ "--orden": orden } as React.CSSProperties}
      className={cn(
        "aparece relative w-full shrink-0 flex-col rounded-tarjeta border border-transparent bg-superficie-2/60 p-2 transition-[background-color,border-color] duration-150 md:flex md:w-auto md:min-w-[200px] md:flex-1 md:basis-0",
        visible ? "flex" : "hidden",
        estado === "destino" &&
          "border-dashed border-acento/50 bg-acento-suave/50",
        estado === "destino-encima" && "border-acento bg-acento-suave",
        estado === "invalida-encima" && "border-dashed border-borde-fuerte",
      )}
    >
      <header className="px-1.5 pt-1 pb-3">
        <h2
          id={`columna-${etapa}`}
          className="m-0 flex items-center gap-2 text-[13px] font-semibold"
        >
          <PuntoDeEtapa etapa={etapa} />
          {NOMBRE_DE_ETAPA[etapa]}
          <span className="cifras rounded-full bg-superficie-3 px-1.5 text-[12px] font-medium text-texto-2">
            {servicios.length}
          </span>
        </h2>
        <p className="cifras m-0 mt-1 min-h-4 text-[12px] leading-4 text-texto-3">
          {totales.length === 0
            ? servicios.length > 0
              ? "Sin importes"
              : ""
            : totales.map((t) => t.replace(/,\d{2}$/, "")).join(" · ")}
        </p>
      </header>
      {servicios.length === 0 ? (
        <div className="mx-1 flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-borde py-8 text-center text-[13px] text-texto-3">
          <Inbox aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Nada en esta etapa
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{children}</ul>
      )}
      {estado === "destino" || estado === "destino-encima" ? (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 bottom-2 m-0 rounded-lg bg-superficie px-3 py-2 text-center text-[12px] font-medium text-acento shadow-flota"
        >
          {accion}
        </p>
      ) : null}
    </section>
  );
}

function ColumnaPlegada({
  plegadas,
  total,
  abiertas,
  alternar,
  visible,
  resaltada,
}: {
  readonly plegadas: readonly ColumnaDelTablero[];
  readonly total: number;
  readonly abiertas: boolean;
  readonly alternar: () => void;
  readonly visible: boolean;
  readonly resaltada: boolean;
}) {
  const seccion = useRef<HTMLElement>(null);
  const yaAbierta = useRef(abiertas);
  useEffect(() => {
    // Al abrirla, que quede a la vista aunque el tablero haga scroll.
    if (abiertas && !yaAbierta.current) {
      seccion.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: sinMovimiento() ? "auto" : "smooth",
      });
    }
    yaAbierta.current = abiertas;
  }, [abiertas]);
  return (
    <section
      ref={seccion}
      aria-label="Cerrados y salidas"
      data-columna={PLEGADAS}
      className={cn(
        "relative w-full shrink-0 flex-col rounded-tarjeta border border-borde bg-superficie-2/40 transition-[width,border-color] duration-200 md:flex",
        visible ? "flex" : "hidden",
        abiertas ? "p-2 md:w-[256px]" : "md:w-12",
        resaltada && "border-dashed border-borde-fuerte",
      )}
    >
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abiertas}
        className={cn(
          "presionable hidden items-center gap-2 rounded-lg text-[13px] font-semibold text-texto-2 hover:bg-superficie-3 hover:text-texto md:flex",
          abiertas
            ? "w-full justify-between px-1.5 py-1"
            : "h-full flex-col justify-start px-0 py-3",
        )}
      >
        {abiertas ? (
          <>
            <span>Cerrados y salidas</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </>
        ) : (
          <>
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="cifras rounded-full bg-superficie-3 px-1.5 text-[12px] font-medium">
              {total}
            </span>
            <span className="flex flex-col items-center gap-1.5 py-1">
              {ETAPAS_PLEGADAS.map((e) => (
                <PuntoDeEtapa key={e} etapa={e} />
              ))}
            </span>
            <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
              Cerrados y salidas
            </span>
          </>
        )}
      </button>
      {abiertas ? (
        <div className="flex flex-col gap-4 md:mt-3">
          {plegadas.map(({ etapa, servicios }) => (
            <div key={etapa}>
              <h3 className="m-0 mb-2 flex items-center gap-2 px-1.5 text-[12px] font-medium text-texto-2">
                <PuntoDeEtapa etapa={etapa} />
                {NOMBRE_DE_ETAPA[etapa]}
                <span className="cifras text-texto-3">{servicios.length}</span>
              </h3>
              {servicios.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {servicios.map((s) => (
                    <li key={s.id}>
                      <TarjetaDeServicio servicio={s} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
