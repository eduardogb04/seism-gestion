import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  formatearCuit,
  normalizarCuit,
} from "../../src/dominio/compartido/cuit.ts";
import { propiedad } from "./_arnes/propiedad.ts";

/** Los pesos del módulo 11, escritos acá aparte: el test no puede apoyarse en el código que prueba. */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** El dígito verificador de un cuerpo de 10 dígitos, o `null` si no tiene (resto 1). */
function digitoDe(cuerpo: readonly number[]): number | null {
  const suma = cuerpo.reduce(
    (total, digito, i) => total + digito * (PESOS[i] ?? 0),
    0,
  );
  const resto = suma % 11;
  if (resto === 0) {
    return 0;
  }
  return resto === 1 ? null : 11 - resto;
}

const cuerpos = fc.array(fc.integer({ min: 0, max: 9 }), {
  minLength: 10,
  maxLength: 10,
});

/** Los CUIT bien armados: un cuerpo inventado con su dígito calculado. */
const cuitsValidos = cuerpos
  .filter((cuerpo) => digitoDe(cuerpo) !== null)
  .map((cuerpo) => [...cuerpo, digitoDe(cuerpo) ?? 0]);

describe("normalizarCuit", () => {
  test("acepta el CUIT con guiones o sin ellos y lo deja en 11 dígitos", () => {
    expect(normalizarCuit("30-00000001-5")).toBe("30000000015");
    expect(normalizarCuit("30000000015")).toBe("30000000015");
    expect(normalizarCuit("  30-00000001-5 ")).toBe("30000000015");
  });

  test("rechaza un dígito verificador que no corresponde", () => {
    expect(normalizarCuit("30-00000001-6")).toBeNull();
  });

  test("rechaza lo que no tiene la forma de un CUIT", () => {
    for (const texto of [
      "",
      "3000000001",
      "300000000155",
      "30-0000001-55",
      "3O-00000001-5",
      "30 00000001 5",
      "30-00000001-",
    ]) {
      expect(normalizarCuit(texto), texto).toBeNull();
    }
  });

  test("todo CUIT armado con su dígito verificador calculado es válido", () => {
    propiedad(cuitsValidos, (digitos) => {
      const pelado = digitos.join("");
      const conGuiones = `${pelado.slice(0, 2)}-${pelado.slice(2, 10)}-${pelado.slice(10)}`;
      return (
        normalizarCuit(pelado) === pelado &&
        normalizarCuit(conGuiones) === pelado
      );
    });
  });

  test("cambiarle un dígito cualquiera a un CUIT válido lo invalida", () => {
    propiedad(
      cuitsValidos,
      fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 1, max: 9 }),
      (digitos, posicion, cambio) => {
        const roto = digitos.map((digito, i) =>
          i === posicion ? (digito + cambio) % 10 : digito,
        );
        return normalizarCuit(roto.join("")) === null;
      },
    );
  });
});

describe("formatearCuit", () => {
  test("pone los guiones: XX-XXXXXXXX-X", () => {
    expect(formatearCuit("30000000015")).toBe("30-00000001-5");
  });
});
