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
 *   `Origen`) los fijen. Ver `docs/adr/0012-historial-de-estados.md`.
 */

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

/** La lista de eventos, en orden de ocurrencia. Solo se agrega al final. */
export interface Historial<
  E extends string,
  F = string,
  A = string,
  O = string,
> {
  readonly eventos: readonly Evento<E, F, A, O>[];
}

/** Quién, cuándo y por qué vía: lo que hay que dar para agregar un evento. */
export interface Marca<F = string, A = string, O = string> {
  readonly en: F;
  readonly actor: A;
  readonly origen: O;
}

/**
 * Código estable del único modo de fallar de este módulo. F0-23 lo pasa al
 * catálogo de errores; hasta entonces vive acá, ya con su código.
 */
export const CODIGO_TRANSICION_INVALIDA =
  "DOMINIO.HISTORIAL.TRANSICION_INVALIDA" as const;

/** Se intentó un cambio de estado que la tabla no declara. */
export interface TransicionInvalida<E extends string> {
  readonly codigo: typeof CODIGO_TRANSICION_INVALIDA;
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
  eventos: readonly Evento<E, F, A, O>[],
): Historial<E, F, A, O> {
  return Object.freeze({ eventos: Object.freeze(eventos) });
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
  function estadoActual(historial: Historial<E, F, A, O>): E {
    const ultimo = historial.eventos.at(-1);
    if (ultimo === undefined) {
      throw new Error(
        "un historial sin eventos no existe: se arma con crear()",
      );
    }
    return ultimo.a;
  }

  return {
    crear(estadoInicial, marca) {
      return congelar([nuevoEvento(null, estadoInicial, marca)]);
    },

    agregar(historial, a, marca) {
      const de = estadoActual(historial);
      const permitidas = definicion.transiciones[de];
      if (!permitidas.includes(a)) {
        return {
          ok: false,
          error: Object.freeze({
            codigo: CODIGO_TRANSICION_INVALIDA,
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

    estadoActual,

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
