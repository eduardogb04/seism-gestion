/**
 * F0-22, R5: el puerto `Auditoria` (`src/puertos/auditoria.ts`) y su doble en
 * memoria (`src/adaptadores/memoria/auditoria.ts`), con una sola
 * implementación en Fase 0 — alcanza con probarlo desde acá (*Cómo se
 * agrega... un puerto nuevo*).
 */
import { describe, expect, it } from "vitest";
import { crearAuditoriaEnMemoria } from "../../src/adaptadores/memoria/auditoria.ts";
import { crearRegistroAuditoria } from "../../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import { crearFechaHora } from "../../src/dominio/compartido/reloj.ts";

const actor = {
  tipo: "persona" as const,
  usuarioId: identificadorDesde<"Usuario">(
    "44444444-4444-4444-8444-444444444444",
  ),
};

function unRegistro() {
  const resultadoFecha = crearFechaHora({
    anio: 2026,
    mes: 9,
    dia: 25,
    hora: 8,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultadoFecha.ok) {
    throw new Error("fecha inválida en el test");
  }
  const resultado = crearRegistroAuditoria({
    entidad: "ServicioDePrueba",
    id: identificadorDesde<string>("55555555-5555-4555-8555-555555555555"),
    accion: "crear",
    antes: null,
    despues: { estado: "borrador" },
    actor,
    en: resultadoFecha.fechaHora,
  });
  if (!resultado.ok) {
    throw new Error("registro de auditoría inválido en el test");
  }
  return resultado.valor;
}

describe("Auditoria en memoria", () => {
  it("registrar guarda el registro y registrados() lo deja ver", async () => {
    const auditoria = crearAuditoriaEnMemoria();
    const registro = unRegistro();

    await auditoria.registrar(registro);

    expect(auditoria.registrados()).toEqual([registro]);
  });

  it("cada llamada a registrar se agrega, ninguna reemplaza a la anterior", async () => {
    const auditoria = crearAuditoriaEnMemoria();
    const primero = unRegistro();
    const segundo = unRegistro();

    await auditoria.registrar(primero);
    await auditoria.registrar(segundo);

    expect(auditoria.registrados()).toEqual([primero, segundo]);
  });
});
