/**
 * Cómo se declara un ABM (F1-03, ADR 0031). Con una `DefinicionAbm`, el modelo
 * de Prisma y su migración, el molde da el listado, el alta, la edición y la
 * baja: los casos de uso (`abm.ts`) y las pantallas leen todo de acá.
 *
 * Un tipo de campo nuevo (número, fecha, opción, relación) es una variante más
 * de `CampoAbm`, con su conversión en `valorDeCampo` y su control en el
 * formulario: hoy existen solo los que usa Grupos.
 */

import type { z } from "zod";
import type { DatosAbm, EntidadAbm } from "../../puertos/repositorios/abm.ts";
import type { Rol } from "../../puertos/repositorios/usuarios.ts";

export type CampoAbm =
  /** Una línea de texto. */
  | { readonly tipo: "texto"; readonly etiqueta: string }
  /** Varias líneas, opcional: vacío se guarda como `null`. */
  | { readonly tipo: "textoLargo"; readonly etiqueta: string };

export type ColumnaAbm<E extends EntidadAbm> = keyof DatosAbm<E> & string;

export type DefinicionAbm<E extends EntidadAbm> = {
  readonly entidad: E;
  /** Cómo se nombra en pantalla: "grupo" y "Grupos". */
  readonly singular: string;
  readonly plural: string;
  /** La ruta del listado; las demás pantallas cuelgan de ella. */
  readonly ruta: string;
  /** En el orden en que se muestran. */
  readonly campos: { readonly [C in ColumnaAbm<E>]: CampoAbm };
  /** Valida los datos ya convertidos; el mensaje de cada regla es el que ve la persona. */
  readonly validacion: z.ZodType<DatosAbm<E>>;
  /** No se repiten entre los no eliminados, sin distinguir mayúsculas. */
  readonly unicos: readonly ColumnaAbm<E>[];
  readonly busqueda: readonly ColumnaAbm<E>[];
  /** Por cuáles se puede ordenar; la primera es el orden por defecto. */
  readonly orden: readonly [ColumnaAbm<E>, ...ColumnaAbm<E>[]];
  readonly rolesQueEscriben: readonly [Rol, ...Rol[]];
};

/** Lo que la persona escribió en el formulario, por campo. */
export type Escrito = Readonly<Record<string, string>>;

/** Los campos con su nombre, en el orden de la definición. */
export function camposDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
): readonly (readonly [string, CampoAbm])[] {
  const campos: Readonly<Record<string, CampoAbm>> = definicion.campos;
  return Object.entries(campos);
}

/** De lo escrito al valor que valida la definición. */
export function valorDeCampo(campo: CampoAbm, escrito: string): string | null {
  switch (campo.tipo) {
    case "texto":
      return escrito;
    case "textoLargo":
      return escrito.trim() === "" ? null : escrito;
  }
}

/** La vuelta: los datos guardados como se escriben en el formulario y se ven en el listado. */
export function escritoDe(
  datos: Readonly<Record<string, string | null>>,
): Escrito {
  return Object.fromEntries(
    Object.entries(datos).map(([campo, valor]) => [campo, valor ?? ""]),
  );
}
