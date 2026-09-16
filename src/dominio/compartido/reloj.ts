/**
 * El reloj del dominio (F0-18). *"No hay una sola llamada a la fecha del
 * sistema dentro del dominio."*
 *
 * `FechaHora` es un tipo propio: el dominio no conoce `Date` ni `Temporal`.
 * Todo lo que necesita —sumar días, meses y años, comparar, medir distancia
 * en días, leer y escribir texto ISO— está acá, con aritmética de fecha
 * civil hecha a mano (enteros, sin ninguna API de fechas de la plataforma).
 *
 * **Fecha civil, sin zona horaria.** Una `FechaHora` es "el 15 de septiembre
 * de 2026 a las 14:30" tal como lo diría alguien en la Argentina: no lleva
 * desplazamiento ni instante universal. Traducir desde y hacia `Date` o
 * `Temporal` —y aplicar la zona— es trabajo de los adaptadores, fuera del
 * dominio. Ver `docs/adr/0012-reloj-y-fechas.md`.
 *
 * Quién lo hace cumplir: la regla `style/noRestrictedGlobals` de `biome.json`,
 * que marca error ante cualquier uso de la global `Date` dentro de
 * `src/dominio/**` (probada por `npm run lint:fixtures`), y
 * dependency-cruiser, que impide que el dominio importe nada de afuera.
 */

/**
 * Marca de tipo: impide armar una `FechaHora` a mano con partes inválidas.
 * Solo `crearFechaHora` y `parsearISO` producen valores de este tipo. Es
 * una declaración ambiente: no existe en tiempo de ejecución.
 */
declare const marcaFechaHora: unique symbol;

/** Las partes de una fecha y hora civiles, antes de validarse. */
export interface PartesFechaHora {
  /** Año, de 1 a 9999. */
  readonly anio: number;
  /** Mes, de 1 a 12. */
  readonly mes: number;
  /** Día del mes, de 1 al último día de ese mes y año. */
  readonly dia: number;
  /** Hora, de 0 a 23. */
  readonly hora: number;
  /** Minuto, de 0 a 59. */
  readonly minuto: number;
  /** Segundo, de 0 a 59. */
  readonly segundo: number;
  /** Milisegundo, de 0 a 999. */
  readonly milisegundo: number;
}

/**
 * Una fecha y hora civiles válidas. Se lee por sus partes (`fecha.anio`,
 * `fecha.mes`, ...) y se compara con `toEqual`: son datos, no objetos con
 * identidad.
 */
export type FechaHora = PartesFechaHora & {
  readonly [marcaFechaHora]: true;
};

/** Resultado de armar una `FechaHora` desde un borde: puede no ser válida. */
export type ResultadoFechaHora =
  | { readonly ok: true; readonly fechaHora: FechaHora }
  | { readonly ok: false; readonly mensaje: string };

/**
 * El reloj que el dominio recibe inyectado. Nadie dentro del dominio
 * pregunta la hora de otra forma.
 */
export interface Reloj {
  ahora(): FechaHora;
}

/** Texto ISO sin zona: `AAAA-MM-DDTHH:MM:SS.mmm`. */
const FORMATO_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;

const ANIO_MINIMO = 1;
const ANIO_MAXIMO = 9999;
const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function esEntero(valor: number): boolean {
  return Number.isInteger(valor);
}

function enRango(valor: number, desde: number, hasta: number): boolean {
  return esEntero(valor) && valor >= desde && valor <= hasta;
}

/** Bisiesto gregoriano: divisible por 4, salvo los siglos no divisibles por 400. */
export function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/** Último día de ese mes en ese año: 28, 29, 30 o 31. */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  if (mes === 2) {
    return esBisiesto(anio) ? 29 : 28;
  }
  return DIAS_POR_MES[mes - 1] ?? 31;
}

/**
 * Arma una `FechaHora` validando cada parte. Es la única entrada al dominio
 * para una fecha: los adaptadores la usan para traducir desde `Date`,
 * `Temporal` o lo que venga del borde.
 */
export function crearFechaHora(partes: PartesFechaHora): ResultadoFechaHora {
  const { anio, mes, dia, hora, minuto, segundo, milisegundo } = partes;

  if (!enRango(anio, ANIO_MINIMO, ANIO_MAXIMO)) {
    return {
      ok: false,
      mensaje: `El año tiene que ser un entero entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}; llegó ${anio}.`,
    };
  }
  if (!enRango(mes, 1, 12)) {
    return {
      ok: false,
      mensaje: `El mes tiene que ser un entero entre 1 y 12; llegó ${mes}.`,
    };
  }
  const ultimoDia = ultimoDiaDelMes(anio, mes);
  if (!enRango(dia, 1, ultimoDia)) {
    return {
      ok: false,
      mensaje: `El día tiene que ser un entero entre 1 y ${ultimoDia} para ${mes}/${anio}; llegó ${dia}.`,
    };
  }
  if (!enRango(hora, 0, 23)) {
    return {
      ok: false,
      mensaje: `La hora tiene que ser un entero entre 0 y 23; llegó ${hora}.`,
    };
  }
  if (!enRango(minuto, 0, 59)) {
    return {
      ok: false,
      mensaje: `El minuto tiene que ser un entero entre 0 y 59; llegó ${minuto}.`,
    };
  }
  if (!enRango(segundo, 0, 59)) {
    return {
      ok: false,
      mensaje: `El segundo tiene que ser un entero entre 0 y 59; llegó ${segundo}.`,
    };
  }
  if (!enRango(milisegundo, 0, 999)) {
    return {
      ok: false,
      mensaje: `El milisegundo tiene que ser un entero entre 0 y 999; llegó ${milisegundo}.`,
    };
  }

  return { ok: true, fechaHora: sellar(partes) };
}

/**
 * Marca partes **ya validadas** como `FechaHora`. Privada a propósito: es el
 * único lugar donde se afirma la validez, y todas las entradas pasan antes
 * por `crearFechaHora` o por la aritmética de acá abajo, que no puede
 * producir una fecha inválida.
 */
function sellar(partes: PartesFechaHora): FechaHora {
  return {
    anio: partes.anio,
    mes: partes.mes,
    dia: partes.dia,
    hora: partes.hora,
    minuto: partes.minuto,
    segundo: partes.segundo,
    milisegundo: partes.milisegundo,
  } as FechaHora;
}

/**
 * Días desde el 1970-01-01 para una fecha civil (algoritmo de Howard
 * Hinnant, `days_from_civil`): aritmética entera, exacta y reversible.
 */
function diasDesdeCivil(anio: number, mes: number, dia: number): number {
  const anioDesplazado = mes <= 2 ? anio - 1 : anio;
  const era = Math.floor(anioDesplazado / 400);
  const anioDeLaEra = anioDesplazado - era * 400;
  const diaDelAnio =
    Math.trunc((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1;
  const diaDeLaEra =
    anioDeLaEra * 365 +
    Math.trunc(anioDeLaEra / 4) -
    Math.trunc(anioDeLaEra / 100) +
    diaDelAnio;
  return era * 146_097 + diaDeLaEra - 719_468;
}

/** La vuelta de `diasDesdeCivil` (`civil_from_days`). */
function civilDesdeDias(dias: number): {
  anio: number;
  mes: number;
  dia: number;
} {
  const desplazado = dias + 719_468;
  const era = Math.floor(desplazado / 146_097);
  const diaDeLaEra = desplazado - era * 146_097;
  const anioDeLaEra = Math.trunc(
    (diaDeLaEra -
      Math.trunc(diaDeLaEra / 1460) +
      Math.trunc(diaDeLaEra / 36_524) -
      Math.trunc(diaDeLaEra / 146_096)) /
      365,
  );
  const anio = anioDeLaEra + era * 400;
  const diaDelAnio =
    diaDeLaEra -
    (365 * anioDeLaEra +
      Math.trunc(anioDeLaEra / 4) -
      Math.trunc(anioDeLaEra / 100));
  const mesDesplazado = Math.trunc((5 * diaDelAnio + 2) / 153);
  const dia = diaDelAnio - Math.trunc((153 * mesDesplazado + 2) / 5) + 1;
  const mes = mesDesplazado < 10 ? mesDesplazado + 3 : mesDesplazado - 9;
  return { anio: mes <= 2 ? anio + 1 : anio, mes, dia };
}

/** Milisegundos transcurridos del día, para comparar dos fechas del mismo día. */
function milisegundosDelDia(fechaHora: FechaHora): number {
  return (
    ((fechaHora.hora * 60 + fechaHora.minuto) * 60 + fechaHora.segundo) * 1000 +
    fechaHora.milisegundo
  );
}

/**
 * Suma días (negativo resta) conservando la hora del día. Sumar y restar la
 * misma cantidad devuelve siempre la fecha original.
 */
export function sumarDias(fechaHora: FechaHora, dias: number): FechaHora {
  const civil = civilDesdeDias(
    diasDesdeCivil(fechaHora.anio, fechaHora.mes, fechaHora.dia) + dias,
  );
  return sellar({
    anio: civil.anio,
    mes: civil.mes,
    dia: civil.dia,
    hora: fechaHora.hora,
    minuto: fechaHora.minuto,
    segundo: fechaHora.segundo,
    milisegundo: fechaHora.milisegundo,
  });
}

/**
 * Suma meses (negativo resta) conservando la hora del día. Si el día no
 * existe en el mes destino se recorta al último de ese mes: 31/01 + 1 mes es
 * 28/02 (o 29/02 en año bisiesto).
 */
export function sumarMeses(fechaHora: FechaHora, meses: number): FechaHora {
  const total = fechaHora.anio * 12 + (fechaHora.mes - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = total - anio * 12 + 1;
  return sellar({
    anio,
    mes,
    dia: Math.min(fechaHora.dia, ultimoDiaDelMes(anio, mes)),
    hora: fechaHora.hora,
    minuto: fechaHora.minuto,
    segundo: fechaHora.segundo,
    milisegundo: fechaHora.milisegundo,
  });
}

/**
 * Suma años (negativo resta). Es `sumarMeses` por doce, así que el mes nunca
 * cambia y el único día que se mueve es el 29 de febrero, que cae en el 28
 * cuando el año destino no es bisiesto. Regla explícita, no un efecto de la
 * implementación.
 */
export function sumarAnios(fechaHora: FechaHora, anios: number): FechaHora {
  return sumarMeses(fechaHora, anios * 12);
}

/**
 * Días civiles enteros de `fechaHora` menos `otra`, **ignorando la hora del
 * día**: del 15 a las 23:59 al 16 a las 00:01 hay un día. Ignorar la hora es
 * lo que la hace antisimétrica y entera; para comparar instantes está
 * `esAnterior`.
 */
export function diferenciaEnDias(
  fechaHora: FechaHora,
  otra: FechaHora,
): number {
  return (
    diasDesdeCivil(fechaHora.anio, fechaHora.mes, fechaHora.dia) -
    diasDesdeCivil(otra.anio, otra.mes, otra.dia)
  );
}

/** `true` si `fechaHora` es estrictamente anterior a `otra`, hora incluida. */
export function esAnterior(fechaHora: FechaHora, otra: FechaHora): boolean {
  const dias = diferenciaEnDias(fechaHora, otra);
  if (dias !== 0) {
    return dias < 0;
  }
  return milisegundosDelDia(fechaHora) < milisegundosDelDia(otra);
}

function rellenar(valor: number, largo: number): string {
  return `${valor}`.padStart(largo, "0");
}

/**
 * Texto `AAAA-MM-DDTHH:MM:SS.mmm`, sin `Z` ni desplazamiento: una fecha
 * civil no es un instante. Es la forma en que una `FechaHora` sale del
 * dominio (persistencia, logs, informes).
 */
export function formatearISO(fechaHora: FechaHora): string {
  const fecha = `${rellenar(fechaHora.anio, 4)}-${rellenar(fechaHora.mes, 2)}-${rellenar(fechaHora.dia, 2)}`;
  const hora = `${rellenar(fechaHora.hora, 2)}:${rellenar(fechaHora.minuto, 2)}:${rellenar(fechaHora.segundo, 2)}.${rellenar(fechaHora.milisegundo, 3)}`;
  return `${fecha}T${hora}`;
}

/**
 * La vuelta de `formatearISO`. Acepta exactamente lo que ese produce y
 * rechaza todo lo demás, incluidos los ISO con zona (`...Z`, `...-03:00`):
 * la zona se resuelve en el borde, no acá.
 */
export function parsearISO(texto: string): ResultadoFechaHora {
  const partes = FORMATO_ISO.exec(texto);
  if (partes === null) {
    return {
      ok: false,
      mensaje: `La fecha tiene que venir como AAAA-MM-DDTHH:MM:SS.mmm, sin zona horaria; llegó "${texto}".`,
    };
  }

  const [, anio, mes, dia, hora, minuto, segundo, milisegundo] = partes;
  return crearFechaHora({
    anio: Number.parseInt(anio ?? "", 10),
    mes: Number.parseInt(mes ?? "", 10),
    dia: Number.parseInt(dia ?? "", 10),
    hora: Number.parseInt(hora ?? "", 10),
    minuto: Number.parseInt(minuto ?? "", 10),
    segundo: Number.parseInt(segundo ?? "", 10),
    milisegundo: Number.parseInt(milisegundo ?? "", 10),
  });
}

/**
 * El reloj de los tests: siempre la misma fecha. Es la implementación que
 * hace testeable cualquier regla con vencimientos, sin esperar ni simular el
 * paso del tiempo.
 */
export function RelojFijo(fechaHora: FechaHora): Reloj {
  return {
    ahora(): FechaHora {
      return fechaHora;
    },
  };
}
