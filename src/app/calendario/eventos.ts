/** Lo que comparten las vistas del calendario: el color de cada tipo, la clave de una entrada y los enlaces. */

import {
  type EntradaDelCalendario,
  TIPOS_DE_ENTRADA,
  type TipoDeEntrada,
} from "../../casos-uso/calendario/calendario.ts";

/** El punto de cada tipo: los colores de etapa del tema (claro y oscuro). */
export const PUNTO_DE_TIPO: Readonly<Record<TipoDeEntrada, string>> = {
  vencimiento: "bg-etapa-finalizado",
  factura: "bg-etapa-adjudicado",
  egreso: "bg-etapa-salida",
  inicio: "bg-etapa-ejecucion",
};

export type Vista = "mes" | "agenda";

export type Estado = {
  readonly mes: string;
  /** La vista pedida; `null` si la elige el ancho de la pantalla. */
  readonly vista: Vista | null;
  readonly tipos: readonly TipoDeEntrada[];
};

/** Identifica una entrada en `?evento=`: tipo, id propio, fecha. */
export function claveDeEntrada(entrada: EntradaDelCalendario): string {
  const propio =
    entrada.vencimiento?.id ?? entrada.enlace.split("/").pop() ?? "";
  return [
    entrada.tipo,
    propio,
    entrada.fecha,
    entrada.renovacion === null ? "p" : "r",
  ].join(".");
}

/** La dirección del calendario con el estado, y a lo sumo una entrada abierta (`evento`) o una renovación (`renovar`). */
export function enlaceDelCalendario(
  { mes, vista, tipos }: Estado,
  extra: {
    readonly evento?: string;
    readonly renovar?: string;
    readonly ancla?: string;
  } = {},
): string {
  const consulta = new URLSearchParams({ mes });
  if (vista !== null) {
    consulta.set("vista", vista);
  }
  if (tipos.length < TIPOS_DE_ENTRADA.length) {
    for (const tipo of tipos) {
      consulta.append("tipo", tipo);
    }
  }
  if (extra.evento !== undefined) {
    consulta.set("evento", extra.evento);
  }
  if (extra.renovar !== undefined) {
    consulta.set("renovar", extra.renovar);
  }
  return `/calendario?${consulta}${extra.ancla === undefined ? "" : `#${extra.ancla}`}`;
}
