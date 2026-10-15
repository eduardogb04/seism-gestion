import { expect, test } from "vitest";
import {
  TOPE_DE_DOCUMENTO,
  tamanoLegible,
} from "../../src/casos-uso/documentos/documentos.ts";

test.each([
  [31, "31 bytes"],
  [1023, "1023 bytes"],
  [1024, "1 KB"],
  [300 * 1024, "300 KB"],
  [1024 * 1024, "1,0 MB"],
  [Math.round(1.5 * 1024 * 1024), "1,5 MB"],
])("%i bytes se ven como %s (1 KB = 1024 bytes)", (bytes, texto) => {
  expect(tamanoLegible(bytes)).toBe(texto);
});

test("el tope de un documento es de 10 MB: 10.485.760 bytes", () => {
  expect(TOPE_DE_DOCUMENTO).toBe(10_485_760);
});
