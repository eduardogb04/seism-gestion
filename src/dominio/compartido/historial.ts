/**
 * Historial de estados solo-agregar (F0-21).
 *
 * *"El estado no es un campo, es un historial de eventos."* Un historial es la
 * lista inmutable de los cambios de estado de algo: cada evento dice de dónde
 * venía, a dónde fue, cuándo, quién y por qué vía. No hay operación que
 * modifique ni borre un evento pasado: solo se agrega al final.
 *
 * Es **genérico**: no sabe qué entidad lo usa. Fase 1 declara los ciclos de
 * `Servicio` y `Ejecución` sobre él.
 *
 * Tres cosas entran de afuera, para que el dominio siga puro y sin `Date`:
 * - la marca de tiempo de cada evento (`en`), que el borde toma del reloj
 *   inyectable de F0-18 — acá nunca se consulta la fecha del sistema;
 * - la aritmética de fechas (`diferenciaEnDias`), que da ese mismo reloj;
 * - los tipos de `en`, `actor` y `origen`, que son parámetros de tipo con
 *   valor por defecto `string` hasta que F0-18 (`FechaHora`) y F0-22 (`Actor`,
 *   `Origen`) los fijen. Ver `docs/adr/0010-historial-de-estados.md`.
 */

import { catalogo } from "./errores/catalogo.ts";

/** Tabla de transiciones declaradas: de cada estado, a cuáles se puede pasar. */
export type Transiciones<E extends string> = Readonly<Record<E, readonly E[]>>;

/** Un cambio de estado ya ocurrido. `de` es `null` solo en el primer evento. */
export interface Evento<E extends string, F = string, A = string, O = string> {
  readonly de: E | null;
  readonly a: E;
  readonly en: F;
  readonly actor: A;
  readonly origen: O;
}

/**
 * Los eventos en orden de ocurrencia. **Nunca está vacía**: un historial nace
 * con su primer evento, y eso lo dice el tipo, no un chequeo en ejecución.
 */
export type Eventos<
  E extends string,
  F = string,
  A = string,
  O = string,
> = readonly [Evento<E, F, A, O>, ...Evento<E, F, A, O>[]];

/** La lista de eventos, en orden de ocurrencia. Solo se agrega al final. */
export interface Historial<
  E extends string,
  F = string,
  A = string,
  O = string,
> {
  readonly eventos: Eventos<E, F, A, O>;
}

/** Quién, cuándo y por qué vía: lo que hay que dar para agregar un evento. */
export interface Marca<F = string, A = string, O = string> {
  readonly en: F;
  readonly actor: A;
  readonly origen: O;
}

/** Se intentó un cambio de estado que la tabla no declara. */
export interface TransicionInvalida<E extends string> {
  readonly codigo: typeof catalogo.DOM_0001.codigo;
  readonly de: E | null;
  readonly a: E;
  readonly permitidas: readonly E[];
  /** Índice que habría ocupado el evento rechazado (el primero es el 0). */
  readonly posicion: number;
}

/** Éxito con valor, o fallo con error: el dominio no lanza por reglas de negocio. */
export type Resultado<T, E> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: E };

/** Lo que se declara una vez por ciclo de vida. */
export interface DefinicionDeCiclo<E extends string, F = string> {
  readonly transiciones: Transiciones<E>;
  /** Días enteros de `desde` a `hasta`; negativo si `hasta` es anterior. */
  readonly diferenciaEnDias: (desde: F, hasta: F) => number;
}

/** Las cinco operaciones del historial, atadas a un ciclo de vida. */
export interface Ciclo<E extends string, F = string, A = string, O = string> {
  crear: (estadoInicial: E, marca: Marca<F, A, O>) => Historial<E, F, A, O>;
  agregar: (
    historial: Historial<E, F, A, O>,
    a: E,
    marca: Marca<F, A, O>,
  ) => Resultado<Historial<E, F, A, O>, TransicionInvalida<E>>;
  estadoActual: (historial: Historial<E, F, A, O>) => E;
  fechaDe: (historial: Historial<E, F, A, O>, estado: E) => F | null;
  diasEntre: (
    historial: Historial<E, F, A, O>,
    desde: E,
    hasta: E,
  ) => number | null;
}

function congelar<E extends string, F, A, O>(
  eventos: Eventos<E, F, A, O>,
): Historial<E, F, A, O> {
  return Object.freeze({ eventos: Object.freeze(eventos) });
}

/** El evento más reciente. Siempre hay uno: la lista no puede estar vacía. */
function ultimoEvento<E extends string, F, A, O>(
  historial: Historial<E, F, A, O>,
): Evento<E, F, A, O> {
  const [primero, ...siguientes] = historial.eventos;
  return siguientes.at(-1) ?? primero;
}

function nuevoEvento<E extends string, F, A, O>(
  de: E | null,
  a: E,
  marca: Marca<F, A, O>,
): Evento<E, F, A, O> {
  return Object.freeze({
    de,
    a,
    en: marca.en,
    actor: marca.actor,
    origen: marca.origen,
  });
}

/** Primer evento que entró a `estado`, o `null` si nunca pasó por ahí. */
function primeraEntrada<E extends string, F, A, O>(
  historial: Historial<E, F, A, O>,
  estado: E,
): Evento<E, F, A, O> | null {
  return historial.eventos.find((candidato) => candidato.a === estado) ?? null;
}

/**
 * Ata las operaciones del historial a una tabla de transiciones y a la
 * aritmética de fechas del reloj. Lo que devuelve no tiene ninguna operación
 * que modifique ni borre un evento pasado: solo `crear` y `agregar` escriben,
 * y las dos devuelven un historial nuevo.
 */
export function definirCiclo<
  E extends string,
  F = string,
  A = string,
  O = string,
>(definicion: DefinicionDeCiclo<E, F>): Ciclo<E, F, A, O> {
  return {
    crear(estadoInicial, marca) {
      return congelar([nuevoEvento(null, estadoInicial, marca)]);
    },

    agregar(historial, a, marca) {
      const de = ultimoEvento(historial).a;
      const permitidas = definicion.transiciones[de];
      if (!permitidas.includes(a)) {
        return {
          ok: false,
          error: Object.freeze({
            codigo: catalogo.DOM_0001.codigo,
            de,
            a,
            permitidas,
            posicion: historial.eventos.length,
          }),
        };
      }
      return {
        ok: true,
        valor: congelar([...historial.eventos, nuevoEvento(de, a, marca)]),
      };
    },

    estadoActual(historial) {
      return ultimoEvento(historial).a;
    },

    fechaDe(historial, estado) {
      return primeraEntrada(historial, estado)?.en ?? null;
    },

    diasEntre(historial, desde, hasta) {
      const entradaDesde = primeraEntrada(historial, desde);
      const entradaHasta = primeraEntrada(historial, hasta);
      if (entradaDesde === null || entradaHasta === null) {
        return null;
      }
      return definicion.diferenciaEnDias(entradaDesde.en, entradaHasta.en);
    },
  };
}
