/**
 * M-05: corre la suite de contrato de `Notificaciones` contra el adaptador
 * `notificaciones-por-log` (Fase 0: sin canal real, el aviso es una línea
 * `warn`) y prueba lo que es solo suyo: el destinatario sale como
 * `usuarioId`, nunca con su email, y un mensaje inválido no escribe nada.
 * Nivel dominio: el log escribe en memoria, sin red ni base.
 */
import { describe, expect, test } from "vitest";
import { crearNotificacionesPorLog } from "../../src/adaptadores/log/notificaciones.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import { crearLog } from "../../src/infraestructura/log.ts";
import type { MensajeNotificacion } from "../../src/puertos/notificaciones.ts";
import { suiteNotificaciones } from "../contratos/notificaciones.ts";

/** Una línea del log, ya parseada. */
type RegistroDeAviso = {
  readonly level: string;
  readonly destinatario: string;
  readonly mensaje: MensajeNotificacion;
};

function logEnMemoria() {
  const escritas: string[] = [];
  const log = crearLog({
    formato: "json",
    nivel: "debug",
    destino: { write: (linea) => escritas.push(linea) },
  });
  const registros = (): RegistroDeAviso[] =>
    escritas
      .join("")
      .split("\n")
      .filter((linea) => linea !== "")
      .map((linea) => JSON.parse(linea) as RegistroDeAviso);
  return { log, registros };
}

suiteNotificaciones("por log", () => {
  const { log, registros } = logEnMemoria();
  return {
    puerto: crearNotificacionesPorLog(log),
    leerEnviados: () =>
      registros().map((registro) => ({
        destinatario: {
          tipo: "persona",
          usuarioId: identificadorDesde<"Usuario">(registro.destinatario),
        } satisfies Actor,
        mensaje: registro.mensaje,
      })),
  };
});

describe("notificaciones-por-log: lo propio del adaptador", () => {
  const usuarioId = identificadorDesde<"Usuario">(
    "00000000-0000-4000-8000-0000000000aa",
  );

  test("escribe un warn con el usuarioId como destinatario y el mensaje, sin email", async () => {
    const { log, registros } = logEnMemoria();
    const notificaciones = crearNotificacionesPorLog(log);

    await notificaciones.enviar(
      { tipo: "persona", usuarioId },
      {
        titulo: "aviso inventado",
        cuerpo: "escribile a persona.inventada@ejemplo.test por favor",
      },
    );

    const lineas = registros();
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({
      level: "warn",
      destinatario: usuarioId,
      mensaje: { titulo: "aviso inventado" },
    });
    expect(JSON.stringify(lineas)).not.toContain("@ejemplo.test");
  });

  test("un mensaje inválido se rechaza y no escribe nada", async () => {
    const { log, registros } = logEnMemoria();
    const notificaciones = crearNotificacionesPorLog(log);

    const resultado = await notificaciones.enviar(
      { tipo: "persona", usuarioId },
      { titulo: "  ", cuerpo: "cuerpo de prueba" },
    );

    expect(resultado.ok).toBe(false);
    expect(registros()).toEqual([]);
  });
});
