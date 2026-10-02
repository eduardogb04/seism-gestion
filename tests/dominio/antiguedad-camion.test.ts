import { describe, expect, it } from "vitest";
import { antiguedadEnAnios } from "../../src/dominio/camiones/antiguedad.ts";
import { crearFechaHora } from "../../src/dominio/compartido/reloj.ts";

function el(anio: number, mes: number, dia: number) {
  const resultado = crearFechaHora({
    anio,
    mes,
    dia,
    hora: 0,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
}

describe("antigüedad de un camión, con el reloj inyectado", () => {
  it("cuenta por año calendario, sin importar el mes", () => {
    expect(antiguedadEnAnios(el(2031, 1, 1), 2020, null)).toBe(11);
    expect(antiguedadEnAnios(el(2031, 12, 31), 2020, null)).toBe(11);
  });

  it("manda la cisterna si la tiene, y si no el tractor", () => {
    expect(antiguedadEnAnios(el(2031, 7, 9), 2020, 2025)).toBe(6);
    expect(antiguedadEnAnios(el(2031, 7, 9), 2020, null)).toBe(11);
  });

  it("uno de este año tiene 0, y uno de un año futuro no baja de 0", () => {
    expect(antiguedadEnAnios(el(2031, 7, 9), 2031, null)).toBe(0);
    expect(antiguedadEnAnios(el(2031, 7, 9), 2040, null)).toBe(0);
  });
});
