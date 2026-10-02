/**
 * Cómo se declara un ABM (F1-03, ADR 0031). Con una `DefinicionAbm`, el modelo
 * de Prisma y su migración, el molde da el listado, el alta, la edición y la
 * baja: los casos de uso (`abm.ts`) y las pantallas leen todo de acá.
 *
 * Un tipo de campo nuevo es una variante más de `CampoAbm`, con su conversión
 * en `valorDeCampo` y su control en el formulario.
 */

import type { z } from "zod";
import {
  formatearImporte,
  formatearMonto,
  type Importe,
  MONEDAS,
  type Moneda,
  parsearImporte,
} from "../../dominio/compartido/importe.ts";
import type { FechaHora } from "../../dominio/compartido/reloj.ts";
import { esDiaValido } from "../../dominio/compartido/reloj.ts";
import type {
  ColumnaDeOrden,
  ColumnaDeSiNo,
  ColumnaDeTexto,
  DatosAbm,
  EntidadAbm,
} from "../../puertos/repositorios/abm.ts";
import type { Rol } from "../../puertos/repositorios/usuarios.ts";

export type OpcionAbm = { readonly valor: string; readonly etiqueta: string };

export type CampoAbm =
  /** Una línea de texto; `opcional`: vacío se guarda como `null`. */
  | {
      readonly tipo: "texto";
      readonly etiqueta: string;
      readonly opcional?: true;
    }
  /** Varias líneas, opcional: vacío se guarda como `null`. */
  | { readonly tipo: "textoLargo"; readonly etiqueta: string }
  /** Uno de una lista fija; la columna guarda el `valor`. */
  | {
      readonly tipo: "opcion";
      readonly etiqueta: string;
      readonly opciones: readonly OpcionAbm[];
    }
  /**
   * Un número con hasta `decimales` decimales (0: entero), que se escribe con
   * coma o con punto. `opcional`: vacío se guarda como `null`. No se busca ni
   * se ordena por un número.
   */
  | {
      readonly tipo: "numero";
      readonly etiqueta: string;
      readonly decimales: number;
      readonly opcional?: true;
    }
  /** Una casilla: el dato es un `boolean`; `marcadaAlCrear`: en el alta viene marcada. */
  | {
      readonly tipo: "siNo";
      readonly etiqueta: string;
      readonly marcadaAlCrear?: true;
    }
  /**
   * Un registro vigente de otra entidad, que se elige de una lista y se
   * muestra por su columna `mostrar`: una de las de orden de la entidad
   * destino. Vacío se guarda como `null`; `obligatoria`: la lista invita a
   * elegir (*Elegí…*) en vez de ofrecer *Ninguno*. `soloSi`: una casilla de la entidad
   * destino (`activo`) que tiene que estar marcada para poder elegirlo; el que ya
   * estaba elegido sigue valiendo al editar aunque la haya perdido.
   */
  | {
      readonly tipo: "relacion";
      readonly etiqueta: string;
      readonly entidad: EntidadAbm;
      readonly mostrar: string;
      readonly obligatoria?: true;
      readonly soloSi?: string;
    }
  /**
   * Un día, sin hora ni zona: el dato es el texto `aaaa-mm-dd`, se escribe con
   * el selector de fecha del navegador y se muestra dd/mm/aaaa. `opcional`: vacío es `null`.
   */
  | {
      readonly tipo: "fecha";
      readonly etiqueta: string;
      readonly opcional?: true;
    }
  /**
   * Un monto con su moneda, juntos: el dato es un `Importe` (centavos enteros y
   * moneda). En el formulario son dos controles: el monto, con el nombre del
   * campo, y la moneda, con `nombreDeMoneda`.
   */
  | { readonly tipo: "importe"; readonly etiqueta: string };

/** Los datos de un registro como los lee un recorrido por campos. */
export type ValoresAbm = Readonly<
  Record<string, string | boolean | number | null | Importe<Moneda>>
>;

export type NombreDeCampo<E extends EntidadAbm> = keyof DatosAbm<E> & string;
export type ColumnaAbm<E extends EntidadAbm> = ColumnaDeTexto<DatosAbm<E>>;
export type ColumnaDeOrdenAbm<E extends EntidadAbm> = ColumnaDeOrden<
  DatosAbm<E>
>;
export type ColumnaSiNoAbm<E extends EntidadAbm> = ColumnaDeSiNo<DatosAbm<E>>;

export type DefinicionAbm<E extends EntidadAbm> = {
  readonly entidad: E;
  /** Cómo se nombra en pantalla: "grupo" y "Grupos". */
  readonly singular: string;
  readonly plural: string;
  /** La ruta del listado; las demás pantallas cuelgan de ella. */
  readonly ruta: string;
  /** En el orden en que se muestran. */
  readonly campos: { readonly [C in NombreDeCampo<E>]: CampoAbm };
  /** Valida los datos ya convertidos; el mensaje de cada regla es el que ve la persona. */
  readonly validacion: z.ZodType<DatosAbm<E>>;
  /**
   * No se repiten entre los no eliminados, sin distinguir mayúsculas. Una
   * columna sola, o un grupo que no se repite **junto** (con su mensaje, que
   * va al lado de la última).
   */
  readonly unicos: readonly (
    | ColumnaAbm<E>
    | {
        readonly columnas: readonly ColumnaAbm<E>[];
        readonly mensaje: string;
      }
  )[];
  readonly busqueda: readonly ColumnaAbm<E>[];
  /** Por cuáles se puede ordenar (un importe, por su monto); la primera es el orden por defecto. */
  readonly orden: readonly [ColumnaDeOrdenAbm<E>, ...ColumnaDeOrdenAbm<E>[]];
  /** En qué sentido se ordena por defecto; sin esto, de menor a mayor. */
  readonly direccionInicial?: "asc" | "desc";
  /**
   * Por qué se filtra el listado, con un selector cada una: una columna de
   * `relacion` (por ese registro) o de `fecha` (por mes, entre los meses que tienen registros).
   */
  readonly filtros?: readonly ColumnaAbm<E>[];
  readonly rolesQueEscriben: readonly [Rol, ...Rol[]];
  /** Las columnas del listado: un campo, o una calculada con su etiqueta (y la fecha de hoy del reloj). */
  readonly listado: readonly (
    | NombreDeCampo<E>
    | {
        readonly etiqueta: string;
        readonly de: (datos: DatosAbm<E>, hoy: FechaHora) => string;
      }
  )[];
  /** Cómo se ve un texto guardado normalizado, en el listado y en el formulario. */
  readonly formato?: {
    readonly [C in ColumnaAbm<E>]?: (guardado: string) => string;
  };
  /** Cómo se escribe lo que se busca en una columna que se guarda normalizada. */
  readonly normalizarBusqueda?: {
    readonly [C in ColumnaAbm<E>]?: (buscado: string) => string;
  };
  /** Los campos cuyos cambios se muestran en la edición, leídos de `auditoria`. */
  readonly historial?: readonly NombreDeCampo<E>[];
};

/** Lo que la persona escribió en el formulario, por campo. */
export type Escrito = Readonly<Record<string, string>>;

/** Lo que dice la casilla marcada: el navegador manda su `value`. */
export const MARCADA = "si";

/** Campos con su nombre, en el orden en que se muestran. */
export type CamposAbm = readonly (readonly [string, CampoAbm])[];

/** Los campos con su nombre, en el orden de la definición. */
export function camposDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
): CamposAbm {
  const campos: Readonly<Record<string, CampoAbm>> = definicion.campos;
  return Object.entries(campos);
}

const NUMERO = /^-?\d+(?:[.,](\d+))?$/;

/** Lo escrito en un campo `numero`: el número, o lo que la persona tiene que corregir. */
export function leerNumero(
  campo: Extract<CampoAbm, { tipo: "numero" }>,
  escrito: string,
): { readonly valor: number | null } | { readonly error: string } {
  const texto = escrito.trim();
  if (texto === "") {
    return campo.opcional === true
      ? { valor: null }
      : { error: "Escribí un número." };
  }
  const partes = NUMERO.exec(texto);
  if (partes === null) {
    return { error: "Escribí un número." };
  }
  if ((partes[1]?.length ?? 0) > campo.decimales) {
    return {
      error:
        campo.decimales === 0
          ? "Escribí un número entero, sin decimales."
          : `Hasta ${campo.decimales} decimales.`,
    };
  }
  return { valor: Number(texto.replace(",", ".")) };
}

/** Las monedas que ofrece el control de un campo `importe`: `app` solo llega al dominio por acá. */
export { MONEDAS };

/** El nombre del control de la moneda de un campo `importe`. */
export function nombreDeMoneda(nombre: string): string {
  return `${nombre}Moneda`;
}

/** El monto escrito y la moneda elegida de un campo `importe`: el importe, o lo que la persona tiene que corregir. */
export function leerImporte(
  nombre: string,
  escrito: Escrito,
): { readonly valor: Importe<Moneda> } | { readonly error: string } {
  const moneda = MONEDAS.find(
    (codigo) => codigo === escrito[nombreDeMoneda(nombre)],
  );
  if (moneda === undefined) {
    return { error: "Elegí la moneda." };
  }
  const monto = escrito[nombre] ?? "";
  if (monto.trim() === "") {
    return { error: "Escribí el importe." };
  }
  const leido = parsearImporte(monto, moneda);
  return leido.ok
    ? { valor: leido.valor }
    : {
        error:
          "Escribí el importe con coma para los decimales y, si querés, punto para los miles (por ejemplo 1.234,50).",
      };
}

/** Lo que la persona tiene que corregir en un campo `fecha`, si algo. */
export function errorDeFecha(
  campo: Extract<CampoAbm, { tipo: "fecha" }>,
  escrito: string,
): string | undefined {
  if (escrito === "") {
    return campo.opcional === true ? undefined : "Elegí una fecha.";
  }
  return esDiaValido(escrito) ? undefined : "Esa fecha no existe.";
}

/** dd/mm/aaaa de un día `aaaa-mm-dd` ya validado. */
export function diaConBarras(dia: string): string {
  const [anio, mes, numero] = dia.split("-");
  return `${numero}/${mes}/${anio}`;
}

/** Lo que trae el formulario de alta antes de escribir: las casillas que vienen marcadas y la moneda por defecto. */
export function valoresDeAlta<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
): Escrito {
  return Object.fromEntries(
    camposDe(definicion).flatMap(([nombre, campo]) => {
      if (campo.tipo === "importe") {
        return [[nombreDeMoneda(nombre), MONEDAS[0]]];
      }
      return campo.tipo === "siNo" && campo.marcadaAlCrear === true
        ? [[nombre, MARCADA]]
        : [];
    }),
  );
}

/** De lo escrito al valor que valida la definición. */
export function valorDeCampo(
  nombre: string,
  campo: CampoAbm,
  todo: Escrito,
): ValoresAbm[string] {
  const escrito = todo[nombre] ?? "";
  switch (campo.tipo) {
    case "texto":
    case "fecha":
      return campo.opcional === true && escrito.trim() === "" ? null : escrito;
    case "textoLargo":
    case "relacion":
      return escrito.trim() === "" ? null : escrito;
    case "opcion":
      return escrito;
    case "numero": {
      const leido = leerNumero(campo, escrito);
      return "valor" in leido ? leido.valor : escrito;
    }
    case "importe": {
      const leido = leerImporte(nombre, todo);
      return "valor" in leido ? leido.valor : escrito;
    }
    case "siNo":
      return escrito !== "";
  }
}

function formatoDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  nombre: string,
): ((guardado: string) => string) | undefined {
  const formatos: Readonly<
    Record<string, ((guardado: string) => string) | undefined>
  > = definicion.formato ?? {};
  return formatos[nombre];
}

/** La vuelta: los datos guardados como se escriben en el formulario. */
export function escritoDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  datos: ValoresAbm,
): Escrito {
  return Object.fromEntries(
    camposDe(definicion).flatMap(([nombre, campo]) => {
      const valor = datos[nombre];
      if (campo.tipo === "siNo") {
        return [[nombre, valor === true ? MARCADA : ""]];
      }
      if (typeof valor === "number") {
        return [[nombre, String(valor).replace(".", ",")]];
      }
      if (typeof valor === "object" && valor !== null) {
        return [
          [nombre, formatearMonto(valor)],
          [nombreDeMoneda(nombre), valor.moneda],
        ];
      }
      const texto = typeof valor === "string" ? valor : "";
      return [[nombre, formatoDe(definicion, nombre)?.(texto) ?? texto]];
    }),
  );
}

/**
 * Cómo se ve un campo en el listado y en la baja. `etiquetas` traduce el id de
 * un registro relacionado a lo que se muestra de él.
 */
export function textoDeCampo<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  nombre: string,
  datos: ValoresAbm,
  etiquetas: ReadonlyMap<string, string>,
): string {
  const campo = camposDe(definicion).find(([clave]) => clave === nombre)?.[1];
  const valor = datos[nombre];
  switch (campo?.tipo) {
    case "siNo":
      return valor === true ? "Sí" : "No";
    case "opcion":
      return campo.opciones.find((o) => o.valor === valor)?.etiqueta ?? "";
    case "relacion":
      return typeof valor === "string" ? (etiquetas.get(valor) ?? "") : "";
    case "numero":
      return typeof valor === "number"
        ? valor.toLocaleString("es-AR", {
            maximumFractionDigits: campo.decimales,
          })
        : "";
    case "fecha":
      return typeof valor === "string" ? diaConBarras(valor) : "";
    case "importe":
      return typeof valor === "object" && valor !== null
        ? formatearImporte(valor)
        : "";
    default:
      return escritoDe(definicion, datos)[nombre] ?? "";
  }
}

export function cabecerasDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
): readonly string[] {
  return definicion.listado.map((columna) =>
    typeof columna === "string"
      ? (camposDe(definicion).find(([clave]) => clave === columna)?.[1]
          .etiqueta ?? columna)
      : columna.etiqueta,
  );
}

/** Las celdas de un registro en el listado, en el orden de `definicion.listado`. */
export function celdasDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  datos: DatosAbm<E>,
  etiquetas: ReadonlyMap<string, string>,
  hoy: FechaHora,
): readonly string[] {
  return definicion.listado.map((columna) =>
    typeof columna === "string"
      ? textoDeCampo(definicion, columna, datos, etiquetas)
      : columna.de(datos, hoy),
  );
}

/** Todos los campos de un registro como se ven en la baja. */
export function textosDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  datos: DatosAbm<E>,
  etiquetas: ReadonlyMap<string, string>,
): readonly (readonly [string, string])[] {
  return camposDe(definicion).map(([nombre, campo]) => [
    campo.etiqueta,
    textoDeCampo(definicion, nombre, datos, etiquetas),
  ]);
}
