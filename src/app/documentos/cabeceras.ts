/**
 * Las cabeceras de la descarga de un documento (F2-05, ADR 0035). El nombre es
 * el que puso quien subió el archivo: antes de ir a una cabecera pierde
 * comillas, barras y cualquier carácter de control (un salto de línea abriría
 * otra cabecera).
 */

/** Comillas y barras, además de los caracteres de control. */
const PROHIBIDOS = ['"', "\\", "/"];

function sinPeligro(nombre: string): string {
  return [...nombre]
    .map((caracter) => {
      const codigo = caracter.codePointAt(0) ?? 0;
      return codigo < 0x20 || codigo === 0x7f || PROHIBIDOS.includes(caracter)
        ? "_"
        : caracter;
    })
    .join("");
}

/** `attachment`, con el nombre en ASCII y, al lado, el mismo nombre completo codificado (RFC 6266). */
function disposicionDeAdjunto(nombre: string): string {
  const seguro = sinPeligro(nombre);
  const ascii = [...seguro]
    .map((caracter) => ((caracter.codePointAt(0) ?? 0) > 0x7e ? "_" : caracter))
    .join("");
  const codificado = encodeURIComponent(seguro).replace(
    /['()*]/g,
    (caracter) =>
      `%${(caracter.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}

export function cabecerasDeDescarga(
  nombre: string,
  tipoMime: string,
): Record<string, string> {
  return {
    "Content-Type": tipoMime,
    "Content-Disposition": disposicionDeAdjunto(nombre),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
}
