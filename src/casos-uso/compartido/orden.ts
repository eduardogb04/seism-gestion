/** Las filas por la clave de una columna (texto), en el sentido pedido; las que empatan quedan como estaban. */
export function ordenarPor<T>(
  filas: readonly T[],
  clave: (fila: T) => string,
  direccion: "asc" | "desc",
): readonly T[] {
  const sentido = direccion === "asc" ? 1 : -1;
  return filas.toSorted(
    (a, b) => sentido * clave(a).localeCompare(clave(b), "es"),
  );
}
