/**
 * La sesión actual (F0-31): con quién entraste, y el botón para salir. Es
 * donde termina el login y lo que mira el e2e. Sin sesión válida, lo dice y
 * ofrece entrar. No protege nada (eso es F0-32).
 */

import { connection } from "next/server.js";
import { sesionActual } from "../sesion-actual.ts";

export default async function SesionActual() {
  await connection();
  const sesion = await sesionActual();
  if (sesion === null) {
    return (
      <main>
        <h1>Sin sesión</h1>
        <p>No hay una sesión abierta en este navegador.</p>
        <a href="/ingresar">Entrar</a>
      </main>
    );
  }
  return (
    <main>
      <h1>Sesión iniciada</h1>
      <p>
        Entraste como <strong data-email-sesion>{sesion.usuario.email}</strong>{" "}
        ({sesion.usuario.rol}).
      </p>
      <form method="post" action="/salir">
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
