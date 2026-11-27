/**
 * La cotización del dólar para cargar el tipo de cambio de una factura: la
 * página pública del Banco Nación (tablas «Billetes» y «Divisas», columna
 * *venta*) y, para el billete, dolarapi.com como respaldo. Solo se piden las
 * cotizaciones: no se manda ningún dato de la persona ni del sistema. Caché en
 * memoria de una hora; si nada responde en 5 s, `null` y se carga a mano.
 */

import {
  FUENTES_DE_CAMBIO,
  type FuenteDeCambio,
} from "../casos-uso/servicios/fuentes-de-cambio.ts";

export type FuenteDeCotizacion = FuenteDeCambio;

export type Cotizacion = {
  /** Pesos por dólar. */
  readonly valor: number;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** Cómo se anota la fuente en el comprobante. */
  readonly fuente: string;
};
const NOMBRE_DE_FUENTE = FUENTES_DE_CAMBIO;

type VentasDelBna = {
  readonly fecha: string;
  readonly billete: number | null;
  readonly divisa: number | null;
};

/** `1625,00` o `1601.5000`: el BNA usa coma en una tabla y punto en la otra. */
function numeroDelBna(texto: string): number | null {
  const limpio = texto.trim();
  const normalizado = limpio.includes(",")
    ? limpio.replaceAll(".", "").replace(",", ".")
    : limpio;
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** La venta del «Dolar U.S.A» de una tabla (`<div id="billetes">` o `<div id="divisas">`). */
function ventaDelDolar(html: string, id: string): number | null {
  const inicio = html.search(new RegExp(`id=["']${id}["']`));
  if (inicio < 0) {
    return null;
  }
  const tabla = /<\/table>/i.exec(html.slice(inicio));
  const trozo = html.slice(
    inicio,
    tabla === null ? undefined : inicio + tabla.index,
  );
  const fila =
    /<tr[^>]*>\s*<td[^>]*>\s*D[oó]lar\s+U\.?S\.?A\.?[^<]*<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/i.exec(
      trozo,
    );
  return fila?.[2] === undefined ? null : numeroDelBna(fila[2]);
}

/** Las ventas del dólar de las dos tablas de la página del BNA y la fecha de la cotización; `null` si no tiene la forma esperada. */
export function parsearCotizacionesBna(html: string): VentasDelBna | null {
  const billete = ventaDelDolar(html, "billetes");
  const divisa = ventaDelDolar(html, "divisas");
  const fecha =
    /<th[^>]*class=["']fechaCot["'][^>]*>\s*(\d{2}\/\d{2}\/\d{4})/i.exec(
      html,
    )?.[1];
  if (fecha === undefined || (billete === null && divisa === null)) {
    return null;
  }
  return { fecha, billete, divisa };
}

const TIEMPO_DE_VIDA_MS = 60 * 60 * 1000;
const TIEMPO_MAXIMO_MS = 5000;

let guardado: { readonly en: number; readonly valor: VentasDelBna } | null =
  null;

async function pedir(url: string): Promise<Response> {
  return fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    headers: { "user-agent": "Mozilla/5.0 (compatible; seism-gestion)" },
  });
}

async function ventasDelBna(): Promise<VentasDelBna | null> {
  if (guardado !== null && Date.now() - guardado.en < TIEMPO_DE_VIDA_MS) {
    return guardado.valor;
  }
  try {
    const respuesta = await pedir("https://www.bna.com.ar/Personas");
    const leido = respuesta.ok
      ? parsearCotizacionesBna(await respuesta.text())
      : null;
    if (leido !== null) {
      guardado = { en: Date.now(), valor: leido };
    }
    return leido;
  } catch {
    return null;
  }
}

/** dd/mm/aaaa del día argentino de un instante ISO. */
function diaArgentino(iso: string): string | null {
  const instante = Date.parse(iso);
  if (Number.isNaN(instante)) {
    return null;
  }
  const [anio, mes, dia] = new Date(instante - 3 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
    .split("-");
  return `${dia}/${mes}/${anio}`;
}

let respaldoGuardado: {
  readonly en: number;
  readonly valor: Cotizacion;
} | null = null;

async function respaldoDelBillete(): Promise<Cotizacion | null> {
  if (
    respaldoGuardado !== null &&
    Date.now() - respaldoGuardado.en < TIEMPO_DE_VIDA_MS
  ) {
    return respaldoGuardado.valor;
  }
  try {
    const respuesta = await pedir("https://dolarapi.com/v1/dolares/oficial");
    if (!respuesta.ok) {
      return null;
    }
    const cuerpo: unknown = await respuesta.json();
    if (typeof cuerpo !== "object" || cuerpo === null) {
      return null;
    }
    const { venta, fechaActualizacion } = cuerpo as Record<string, unknown>;
    const fecha =
      typeof fechaActualizacion === "string"
        ? diaArgentino(fechaActualizacion)
        : null;
    if (typeof venta !== "number" || !(venta > 0) || fecha === null) {
      return null;
    }
    const valor = {
      valor: venta,
      fecha,
      fuente: NOMBRE_DE_FUENTE.billete,
    };
    respaldoGuardado = { en: Date.now(), valor };
    return valor;
  } catch {
    return null;
  }
}

/** La venta del dólar billete o divisa del BNA, o `null` si no se pudo traer. */
export async function cotizacionDolar(
  fuente: FuenteDeCotizacion,
): Promise<Cotizacion | null> {
  const bna = await ventasDelBna();
  const valor = bna?.[fuente] ?? null;
  if (bna !== null && valor !== null) {
    return { valor, fecha: bna.fecha, fuente: NOMBRE_DE_FUENTE[fuente] };
  }
  return fuente === "billete" ? respaldoDelBillete() : null;
}
