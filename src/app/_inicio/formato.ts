/** `ARS 1.250.000,00` → moneda y número por separado, para dibujarlos con distinto peso. */
export function partirImporte(valor: string): {
  moneda: string;
  numero: string;
} {
  const [moneda = "", ...resto] = valor.split(" ");
  return { moneda, numero: resto.join(" ") };
}

/** Sin centavos para los números grandes de las tarjetas. */
export function sinCentavos(numero: string): string {
  return numero.replace(/,\d{2}$/, "");
}

const ZONA = "America/Argentina/Catamarca";

export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(
    new Date(),
  );
}

/** Días entre hoy y una fecha `aaaa-mm-dd` (negativo si ya pasó). */
export function diasHasta(fecha: string): number {
  const a = Date.parse(`${hoyISO()}T00:00:00Z`);
  const b = Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function distancia(fecha: string): string {
  const d = diasHasta(fecha);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

export function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${fecha.slice(0, 10)}T12:00:00Z`))
    .replace(".", "");
}

export function saludo(): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: ZONA,
    }).format(new Date()),
  );
  return hora < 13 ? "Buen día" : hora < 20 ? "Buenas tardes" : "Buenas noches";
}

export function fechaLarga(): string {
  const texto = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: ZONA,
  }).format(new Date());
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Nombre a partir del email: `maria.gomez@…` → `María`… sin tildes: `Maria`. */
export function nombreDe(email: string): string {
  const primero = (email.split("@")[0] ?? "").split(/[._-]+/)[0] ?? "";
  return primero.charAt(0).toUpperCase() + primero.slice(1);
}

export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 100);
}

export function compacto(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
