import { describe, expect, it } from "vitest";
import { archivoSubidoEn } from "../../src/app/catalogo/_abm/escrito.ts";

function formularioCon(archivo: File): FormData {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  return formulario;
}

describe("archivoSubidoEn", () => {
  // Next decodifica la parte sin archivo (`filename=""`) con el nombre que le
  // da `File`: «blob» en Next 16.3 y «undefined» desde 16.4.
  it.each(["", "blob", "undefined"])(
    "una parte vacía llamada «%s» no es un archivo elegido",
    async (nombre) => {
      expect(
        await archivoSubidoEn(formularioCon(new File([], nombre))),
      ).toBeNull();
    },
  );

  it("un archivo con contenido llega con su nombre y sus bytes", async () => {
    const archivo = await archivoSubidoEn(
      formularioCon(new File(["abc"], "comprobante.pdf")),
    );
    expect(archivo?.nombre).toBe("comprobante.pdf");
    expect(archivo?.bytes).toEqual(new TextEncoder().encode("abc"));
  });

  it("un archivo vacío elegido a propósito trae su nombre y no se descarta", async () => {
    const archivo = await archivoSubidoEn(
      formularioCon(new File([], "vacio.pdf")),
    );
    expect(archivo?.nombre).toBe("vacio.pdf");
  });
});
