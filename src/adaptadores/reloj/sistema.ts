/**
 * El reloj real (F0-22): nace en la primera tarea que guarda fechas en la
 * base (decisión de ESTADO 2026-09-15, F0-18). Lee la hora del sistema con
 * `Date` — el único lugar fuera de `scripts/` y `tests/` donde está
 * permitido: la regla de Biome `noRestrictedGlobals` (F0-18, ADR 0012) solo
 * prohíbe la global `Date` dentro de `**\/src/dominio/**`, y este archivo
 * vive en `src/adaptadores/`.
 *
 * Lo inyecta el punto de armado: desde F0-27,
 * `src/infraestructura/arranque/almacen.ts` (la clave de un documento nuevo).
 */
import {
  crearFechaHora,
  type FechaHora,
  type Reloj,
} from "../../dominio/compartido/reloj.ts";

/** La zona de la base de SeisM (Andalgalá). El dominio trabaja en fecha civil argentina (ADR 0012). */
export const ZONA_ARGENTINA = "America/Argentina/Catamarca";

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_ARGENTINA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * La fecha y hora civiles **argentinas** de un instante, en zona IANA
 * explícita: no depende de la zona horaria de la máquina (la imagen Docker
 * corre en UTC; auditoría del front 2026-11-22, A1).
 */
export function fechaHoraLocalDe(instante: Date): FechaHora {
  const p: Record<string, number> = {};
  for (const parte of PARTES.formatToParts(instante)) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  const resultado = crearFechaHora({
    anio: p.year ?? 0,
    mes: p.month ?? 0,
    dia: p.day ?? 0,
    hora: p.hour ?? 0,
    minuto: p.minute ?? 0,
    segundo: p.second ?? 0,
    milisegundo: instante.getUTCMilliseconds(),
  });
  if (!resultado.ok) {
    throw new Error(
      `el reloj del sistema dio una fecha inválida (esto no debería pasar nunca): ${resultado.mensaje}`,
    );
  }
  return resultado.fechaHora;
}

/** Un `Reloj` que lee la hora argentina en cada `ahora()`. */
export function crearRelojSistema(): Reloj {
  return {
    ahora(): FechaHora {
      return fechaHoraLocalDe(new Date());
    },
  };
}
