/** Los parámetros del listado que viajan en la dirección. */
export type ParametrosDelListado = Readonly<Record<string, string>>;

/** Solo los parámetros de texto, sin los vacíos. */
export function parametrosDe(
  crudos: Readonly<Record<string, string | string[] | undefined>>,
): ParametrosDelListado {
  return Object.fromEntries(
    Object.entries(crudos).flatMap(([clave, valor]) =>
      typeof valor === "string" && valor !== "" ? [[clave, valor]] : [],
    ),
  );
}

/**
 * `/servicios` con los parámetros de hoy cambiados por `cambios` (`null`
 * borra). Cambiar un filtro o el orden vuelve a la primera página; el alta
 * abierta (`nuevo`) se cae salvo que se pida.
 */
export function enlaceDelListado(
  actuales: ParametrosDelListado,
  cambios: Readonly<Record<string, string | null>>,
): string {
  const juntos: Record<string, string | null> = { ...actuales, ...cambios };
  // Abrir el alta no cambia la página; cerrarla (o cualquier otro cambio) la saca.
  if (!("pagina" in cambios) && !("nuevo" in cambios)) {
    delete juntos.pagina;
  }
  if (!("nuevo" in cambios)) {
    delete juntos.nuevo;
  }
  const consulta = new URLSearchParams(
    Object.entries(juntos).flatMap(([clave, valor]) =>
      valor === null || valor === "" ? [] : [[clave, valor]],
    ),
  ).toString();
  return consulta === "" ? "/servicios" : `/servicios?${consulta}`;
}
