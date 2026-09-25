/**
 * F0-22: `Auditable<T>` — el envoltorio que le agrega a cualquier valor
 * *"quién lo creó, quién lo cambió por última vez, y si alguien lo borró"*
 * (borrado lógico, nunca físico). Funciones puras: nunca mutan el
 * `Auditable` que reciben, siempre devuelven uno nuevo.
 */
import { describe, expect, it } from "vitest";
import {
  crearAuditable,
  crearRegistroAuditoria,
  marcarActualizado,
  marcarEliminado,
} from "../../src/dominio/compartido/auditable.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";

function fechaHoraDePrueba(hora: number) {
  const resultado = crearFechaHora({
    anio: 2026,
    mes: 9,
    dia: 25,
    hora,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(`fecha inválida en el test: ${resultado.mensaje}`);
  }
  return resultado.fechaHora;
}

const actorCreador = {
  tipo: "persona" as const,
  usuarioId: identificadorDesde<"Usuario">(
    "11111111-1111-4111-8111-111111111111",
  ),
};

const actorEditor = {
  tipo: "persona" as const,
  usuarioId: identificadorDesde<"Usuario">(
    "22222222-2222-4222-8222-222222222222",
  ),
};

describe("crearAuditable", () => {
  it("un valor recién creado tiene creado y actualizado iguales, con el mismo actor", () => {
    const reloj = RelojFijo(fechaHoraDePrueba(10));
    const auditable = crearAuditable(
      { nombre: "servicio de prueba" },
      actorCreador,
      reloj,
    );

    expect(auditable.valor).toEqual({ nombre: "servicio de prueba" });
    expect(auditable.creadoEn).toEqual(fechaHoraDePrueba(10));
    expect(auditable.actualizadoEn).toEqual(fechaHoraDePrueba(10));
    expect(auditable.creadoPor).toEqual(actorCreador);
    expect(auditable.actualizadoPor).toEqual(actorCreador);
    expect(auditable.eliminadoEn).toBeUndefined();
    expect(auditable.eliminadoPor).toBeUndefined();
  });
});

describe("marcarActualizado", () => {
  it("cambia el valor y quién actualizó, sin tocar quién creó", () => {
    const relojCreacion = RelojFijo(fechaHoraDePrueba(10));
    const original = crearAuditable("v1", actorCreador, relojCreacion);

    const relojEdicion = RelojFijo(fechaHoraDePrueba(12));
    const resultado = marcarActualizado(
      original,
      "v2",
      actorEditor,
      relojEdicion,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.valor).toBe("v2");
      expect(resultado.valor.actualizadoEn).toEqual(fechaHoraDePrueba(12));
      expect(resultado.valor.actualizadoPor).toEqual(actorEditor);
      expect(resultado.valor.creadoEn).toEqual(fechaHoraDePrueba(10));
      expect(resultado.valor.creadoPor).toEqual(actorCreador);
    }
  });

  it("no muta el Auditable original: el de antes sigue con su valor viejo", () => {
    const reloj = RelojFijo(fechaHoraDePrueba(10));
    const original = crearAuditable("v1", actorCreador, reloj);

    marcarActualizado(original, "v2", actorEditor, reloj);

    expect(original.valor).toBe("v1");
  });

  it("sobre un Auditable ya eliminado, rechaza con DOMINIO.AUDITABLE.YA_ELIMINADO", () => {
    const reloj = RelojFijo(fechaHoraDePrueba(10));
    const creado = crearAuditable("v1", actorCreador, reloj);
    const eliminado = marcarEliminado(creado, actorCreador, reloj);
    if (!eliminado.ok) {
      throw new Error("el armado del auditable eliminado del test falló");
    }

    const resultado = marcarActualizado(
      eliminado.valor,
      "v2",
      actorEditor,
      reloj,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe("DOMINIO.AUDITABLE.YA_ELIMINADO");
    }
  });
});

describe("marcarEliminado", () => {
  it("marca cuándo y quién lo borró, sin tocar el valor", () => {
    const relojCreacion = RelojFijo(fechaHoraDePrueba(10));
    const creado = crearAuditable("v1", actorCreador, relojCreacion);

    const relojBorrado = RelojFijo(fechaHoraDePrueba(15));
    const resultado = marcarEliminado(creado, actorEditor, relojBorrado);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.valor).toBe("v1");
      expect(resultado.valor.eliminadoEn).toEqual(fechaHoraDePrueba(15));
      expect(resultado.valor.eliminadoPor).toEqual(actorEditor);
    }
  });

  it("no existe un `eliminar` físico: marcarEliminado es la única forma de borrar, y no lanza", () => {
    const reloj = RelojFijo(fechaHoraDePrueba(10));
    const creado = crearAuditable("v1", actorCreador, reloj);

    expect(() => marcarEliminado(creado, actorCreador, reloj)).not.toThrow();
  });

  it("borrar dos veces el mismo Auditable rechaza la segunda con DOMINIO.AUDITABLE.YA_ELIMINADO", () => {
    const reloj = RelojFijo(fechaHoraDePrueba(10));
    const creado = crearAuditable("v1", actorCreador, reloj);
    const primeraVez = marcarEliminado(creado, actorCreador, reloj);
    if (!primeraVez.ok) {
      throw new Error("la primera eliminación del test falló");
    }

    const segundaVez = marcarEliminado(primeraVez.valor, actorEditor, reloj);

    expect(segundaVez.ok).toBe(false);
    if (!segundaVez.ok) {
      expect(segundaVez.error.codigo).toBe("DOMINIO.AUDITABLE.YA_ELIMINADO");
    }
  });
});

describe("crearRegistroAuditoria", () => {
  const entidad = "ServicioDePrueba";
  const id = identificadorDesde<string>("33333333-3333-4333-8333-333333333333");
  const en = fechaHoraDePrueba(9);

  it("un registro de crear, con antes en null, se acepta y conserva sus datos", () => {
    const datos = {
      entidad,
      id,
      accion: "crear" as const,
      antes: null,
      despues: { estado: "borrador" },
      actor: actorCreador,
      en,
    };

    const resultado = crearRegistroAuditoria(datos);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor).toEqual(datos);
    }
  });

  it("un registro de crear con un antes rechaza: no existía nada previo", () => {
    const resultado = crearRegistroAuditoria({
      entidad,
      id,
      accion: "crear",
      antes: { estado: "borrador" },
      despues: { estado: "borrador" },
      actor: actorCreador,
      en,
    });

    expect(resultado.ok).toBe(false);
  });

  it("un registro de eliminar con el después marcado eliminadoEn se acepta (borrado lógico) y conserva sus datos", () => {
    const datos = {
      entidad,
      id,
      accion: "eliminar" as const,
      antes: { estado: "activo" },
      despues: { estado: "activo", eliminadoEn: en },
      actor: actorCreador,
      en,
    };

    const resultado = crearRegistroAuditoria(datos);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor).toEqual(datos);
    }
  });

  it("un registro de eliminar sin eliminadoEn en el después rechaza: acá tampoco hay borrado físico", () => {
    const resultado = crearRegistroAuditoria({
      entidad,
      id,
      accion: "eliminar",
      antes: { estado: "activo" },
      despues: { estado: "activo" },
      actor: actorCreador,
      en,
    });

    expect(resultado.ok).toBe(false);
  });

  it("un registro de eliminar con después en null rechaza", () => {
    const resultado = crearRegistroAuditoria({
      entidad,
      id,
      accion: "eliminar",
      antes: { estado: "activo" },
      despues: null,
      actor: actorCreador,
      en,
    });

    expect(resultado.ok).toBe(false);
  });

  it("una entidad vacía se rechaza", () => {
    const resultado = crearRegistroAuditoria({
      entidad: "   ",
      id,
      accion: "actualizar",
      antes: { estado: "a" },
      despues: { estado: "b" },
      actor: actorCreador,
      en,
    });

    expect(resultado.ok).toBe(false);
  });
});
