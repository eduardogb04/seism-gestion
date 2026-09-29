/**
 * El reloj real (F0-22): nace en la primera tarea que guarda fechas en la
 * base (decisión de ESTADO 2026-09-15, F0-18). Lee la hora del sistema con
 * `Date` — el único lugar fuera de `scripts/` y `tests/` donde está
 * permitido: la regla de Biome `noRestrictedGlobals` (F0-18, ADR 0012) solo
 * prohíbe la global `Date` dentro de `**\/src/dominio/**`, y este archivo
 * vive en `src/adaptadores/`.
 *
 * Todavía no hay punto de armado (`src/infraestructura/arranque/`): nadie
 * lo inyecta en nada más. Queda para la tarea que lo cree.
 */
import {
  crearFechaHora,
  type FechaHora,
  type Reloj,
} from "../../dominio/compartido/reloj.ts";

/**
 * La fecha y hora civiles **locales** de un instante: la misma lectura que
 * hace el reloj del sistema, así que dos `FechaHora` sacadas de acá (o de
 * `crearRelojSistema`) se pueden restar entre sí sin que la zona horaria de
 * la máquina cuente (F0-26: el panel de salud compara "ahora" con el inicio
 * de una corrida que guardó la base). Los componentes que da `Date` (año,
 * mes 0-indexado, día, hora, minuto, segundo, milisegundo) siempre caen
 * dentro de los rangos que `crearFechaHora` acepta, así que el resultado
 * siempre es `ok`.
 */
export function fechaHoraLocalDe(instante: Date): FechaHora {
  const resultado = crearFechaHora({
    anio: instante.getFullYear(),
    mes: instante.getMonth() + 1,
    dia: instante.getDate(),
    hora: instante.getHours(),
    minuto: instante.getMinutes(),
    segundo: instante.getSeconds(),
    milisegundo: instante.getMilliseconds(),
  });
  if (!resultado.ok) {
    // Inalcanzable: los componentes de `Date` siempre están en rango.
    throw new Error(
      `el reloj del sistema dio una fecha inválida (esto no debería pasar nunca): ${resultado.mensaje}`,
    );
  }
  return resultado.fechaHora;
}

/** Un `Reloj` que lee la hora local del sistema en cada `ahora()`. */
export function crearRelojSistema(): Reloj {
  return {
    ahora(): FechaHora {
      return fechaHoraLocalDe(new Date());
    },
  };
}
