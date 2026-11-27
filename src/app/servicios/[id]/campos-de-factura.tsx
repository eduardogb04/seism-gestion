"use client";

/**
 * Los controles propios de la ventana «Nueva factura» que van dentro de su
 * formulario: el vencimiento que sigue a la fecha (30 días, mientras nadie lo
 * toque) y el tipo de cambio que se trae solo al elegir dólares, con sus dos
 * fuentes del Banco Nación y la posibilidad de escribirlo a mano.
 */

import { useEffect, useId, useRef, useState } from "react";
import { monedaEscrita } from "../../../casos-uso/abm/definicion.ts";
import {
  FUENTE_MANUAL,
  FUENTES_DE_CAMBIO,
  type FuenteDeCambio,
} from "../../../casos-uso/servicios/fuentes-de-cambio.ts";
import {
  CLASES_DE_CONTROL,
  ErrorDeCampo,
  Etiqueta,
} from "../../_ui/campo-texto.tsx";
import {
  useErroresDelFormulario,
  useEscritoEnVivo,
} from "../../_ui/formulario-abm.tsx";
import { Selector } from "../../_ui/selector.tsx";
import { traerCotizacion } from "../acciones.ts";

const DIAS_AL_VENCIMIENTO = 30;

function masDias(dia: string, dias: number): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (partes === null) {
    return null;
  }
  const fecha = new Date(
    Date.UTC(
      Number(partes[1]),
      Number(partes[2]) - 1,
      Number(partes[3]) + dias,
    ),
  );
  return Number.isNaN(fecha.getTime())
    ? null
    : fecha.toISOString().slice(0, 10);
}

/** Sin pintar nada: cuando cambia la fecha, mueve el vencimiento 30 días después, salvo que se lo haya tocado. */
export function VencimientoALosTreintaDias() {
  const { fecha } = useEscritoEnVivo();
  const marca = useRef<HTMLSpanElement>(null);
  const propuesto = useRef<string | null>(null);
  useEffect(() => {
    const control = marca.current
      ?.closest("form")
      ?.elements.namedItem("vencimiento");
    const nuevo = masDias(fecha ?? "", DIAS_AL_VENCIMIENTO);
    if (!(control instanceof HTMLInputElement) || nuevo === null) {
      return;
    }
    const sinTocar =
      control.value === "" ||
      control.value === propuesto.current ||
      propuesto.current === null;
    propuesto.current = nuevo;
    if (sinTocar) {
      control.value = nuevo;
    }
  }, [fecha]);
  return <span ref={marca} hidden />;
}

type Origen = FuenteDeCambio | "manual";

function origenDe(fuente: string, valor: string): Origen {
  const conocida = (Object.keys(FUENTES_DE_CAMBIO) as FuenteDeCambio[]).find(
    (clave) => FUENTES_DE_CAMBIO[clave] === fuente,
  );
  return conocida ?? (valor === "" ? "billete" : "manual");
}

/** El tipo de cambio de una factura en dólares: elige la fuente, trae la cotización y la deja editable. */
export function CambioAutomatico() {
  const escrito = useEscritoEnVivo();
  const errores = useErroresDelFormulario();
  const id = useId();
  const enDolares = monedaEscrita("importe", escrito) === "USD";
  const [valor, setValor] = useState(escrito.cambio ?? "");
  const [fuente, setFuente] = useState(escrito.cambioFuente ?? "");
  const [origen, setOrigen] = useState<Origen>(() =>
    origenDe(escrito.cambioFuente ?? "", escrito.cambio ?? ""),
  );
  const [fecha, setFecha] = useState<string | null>(null);
  const [estado, setEstado] = useState<"quieto" | "trayendo" | "fallo">(
    "quieto",
  );
  const primera = useRef(valor !== "");

  useEffect(() => {
    if (!enDolares || origen === "manual") {
      return;
    }
    if (primera.current) {
      primera.current = false;
      return;
    }
    let vigente = true;
    setEstado("trayendo");
    traerCotizacion(origen).then(
      (cotizacion) => {
        if (!vigente) {
          return;
        }
        if (cotizacion === null) {
          setEstado("fallo");
          return;
        }
        setValor(cotizacion.valor);
        setFuente(cotizacion.fuente);
        setFecha(cotizacion.fecha);
        setEstado("quieto");
      },
      () => vigente && setEstado("fallo"),
    );
    return () => {
      vigente = false;
    };
  }, [enDolares, origen]);

  if (!enDolares) {
    return null;
  }
  return (
    <div className="mt-4 flex flex-col gap-4">
      <Selector
        etiqueta="Tipo de cambio"
        value={origen}
        onChange={(evento) => {
          const elegido = evento.target.value as Origen;
          setOrigen(elegido);
          if (elegido === "manual") {
            setFuente(FUENTE_MANUAL);
          }
        }}
        opciones={[
          { valor: "billete", texto: FUENTES_DE_CAMBIO.billete },
          { valor: "divisa", texto: FUENTES_DE_CAMBIO.divisa },
          { valor: "manual", texto: FUENTE_MANUAL },
        ]}
      />
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor={id}>Cotización (pesos por dólar)</Etiqueta>
        <input
          id={id}
          name="cambio"
          required
          type="text"
          inputMode="decimal"
          value={valor}
          aria-invalid={errores.cambio !== undefined}
          className={`${CLASES_DE_CONTROL} cifras`}
          onChange={(evento) => {
            setValor(evento.target.value);
            setOrigen("manual");
            setFuente(FUENTE_MANUAL);
          }}
        />
        <input type="hidden" name="cambioFuente" value={fuente} />
        <ErrorDeCampo id={id} error={errores.cambio} />
        <p
          role="status"
          className={`m-0 text-[13px] ${estado === "fallo" ? "text-aviso" : "text-texto-3"}`}
        >
          {estado === "trayendo"
            ? "Trayendo la cotización…"
            : estado === "fallo"
              ? "No se pudo traer la cotización: cargala a mano."
              : fecha !== null && origen !== "manual"
                ? `Cotización del ${fecha}.`
                : ""}
        </p>
      </div>
    </div>
  );
}
