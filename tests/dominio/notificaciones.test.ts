/**
 * F0-29: cada aviso tiene un único destinatario (dirigidas, no
 * difundidas — criterio de Eduardo). Se prueba con el compilador, no en
 * runtime: `enviar` no acepta un arreglo de `Actor`.
 */
import { describe, expect, it } from "vitest";
import { crearNotificacionesEnMemoria } from "../../src/adaptadores/memoria/notificaciones.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";

describe("Notificaciones: un único destinatario", () => {
  it("enviar no acepta un arreglo de Actor: no compila", () => {
    const notificaciones = crearNotificacionesEnMemoria();
    const destinatarios: Actor[] = [
      { tipo: "persona", usuarioId: identificadorDesde("1") },
      { tipo: "persona", usuarioId: identificadorDesde("2") },
    ];

    // @ts-expect-error `enviar` recibe un único `Actor`, no un arreglo: los
    // avisos son dirigidas, no difundidas.
    const promesa = notificaciones.enviar(destinatarios, {
      titulo: "aviso de prueba",
      cuerpo: "cuerpo de prueba",
    });

    expect(promesa).toBeInstanceOf(Promise);
  });
});
