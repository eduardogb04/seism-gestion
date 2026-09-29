/**
 * Suite de contrato del puerto `Notificaciones` (F0-29, R7 de la ficha). Un
 * adaptador real (Gmail, WhatsApp, Telegram, SMTP: Fase 1) tiene que pasar
 * esta misma suite, con su propia forma de leer lo enviado — no
 * `enviados()` directo del doble en memoria (ver `AGENTS.md`, *Cómo se
 * agrega...un adaptador real de un puerto con suite de contrato*).
 */
import { describe, expect, it } from "vitest";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import type {
  MensajeNotificacion,
  Notificaciones,
} from "../../src/puertos/notificaciones.ts";

/** Un envío ya hecho, tal como la fábrica lo deja leer. */
export interface EnvioLeido {
  readonly destinatario: Actor;
  readonly mensaje: MensajeNotificacion;
}

/** Lo que una fábrica de `Notificaciones` le da a la suite. */
export type FabricaNotificaciones = () => {
  readonly puerto: Notificaciones;
  /** Los envíos hechos hasta ahora, en el orden en que se hicieron. */
  leerEnviados(): Promise<readonly EnvioLeido[]> | readonly EnvioLeido[];
};

const DESTINATARIO_DE_PRUEBA: Actor = {
  tipo: "persona",
  usuarioId: identificadorDesde("00000000-0000-4000-8000-000000000001"),
};

/** Corre la suite de contrato de `Notificaciones` contra la fábrica que se le pase. */
export function suiteNotificaciones(
  nombre: string,
  fabrica: FabricaNotificaciones,
): void {
  describe(`contrato: Notificaciones (${nombre})`, () => {
    it("un aviso válido queda registrado con su destinatario y su mensaje", async () => {
      const { puerto, leerEnviados } = fabrica();
      const mensaje: MensajeNotificacion = {
        titulo: "aviso de prueba",
        cuerpo: "cuerpo de aviso de prueba",
        referencia: "referencia-de-prueba",
      };

      const resultado = await puerto.enviar(DESTINATARIO_DE_PRUEBA, mensaje);

      expect(resultado.ok).toBe(true);
      const enviados = await leerEnviados();
      expect(enviados).toEqual([
        { destinatario: DESTINATARIO_DE_PRUEBA, mensaje },
      ]);
    });

    it("varios avisos quedan registrados en el orden en que se mandaron", async () => {
      const { puerto, leerEnviados } = fabrica();
      const primero: MensajeNotificacion = {
        titulo: "primer aviso",
        cuerpo: "primer cuerpo",
      };
      const segundo: MensajeNotificacion = {
        titulo: "segundo aviso",
        cuerpo: "segundo cuerpo",
      };

      await puerto.enviar(DESTINATARIO_DE_PRUEBA, primero);
      await puerto.enviar(DESTINATARIO_DE_PRUEBA, segundo);

      const enviados = await leerEnviados();
      expect(enviados.map((e) => e.mensaje.titulo)).toEqual([
        primero.titulo,
        segundo.titulo,
      ]);
    });

    it("un título vacío se rechaza", async () => {
      const { puerto } = fabrica();

      const resultado = await puerto.enviar(DESTINATARIO_DE_PRUEBA, {
        titulo: "",
        cuerpo: "cuerpo de prueba",
      });

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.codigo).toBe("NOTIFICACIONES.MENSAJE_INVALIDO");
        expect(resultado.error.campo).toBe("titulo");
      }
    });

    it("un cuerpo vacío se rechaza", async () => {
      const { puerto } = fabrica();

      const resultado = await puerto.enviar(DESTINATARIO_DE_PRUEBA, {
        titulo: "título de prueba",
        cuerpo: "",
      });

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.codigo).toBe("NOTIFICACIONES.MENSAJE_INVALIDO");
        expect(resultado.error.campo).toBe("cuerpo");
      }
    });
  });
}
