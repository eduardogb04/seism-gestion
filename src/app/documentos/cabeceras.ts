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

/** Lo que el navegador puede mostrar sin riesgo en una pestaña: PDF e imágenes. */
const SE_PUEDE_VER = ["application/pdf", "image/png", "image/jpeg"];

export function cabecerasDeDescarga(
  nombre: string,
  tipoMime: string,
  verEnLinea = false,
): Record<string, string> {
  return {
    "Content-Type": tipoMime,
    "Content-Disposition":
      verEnLinea && SE_PUEDE_VER.includes(tipoMime)
        ? "inline"
        : disposicionDeAdjunto(nombre),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
}
