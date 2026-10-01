/**
 * La sesión actual (F0-31): con quién entraste, y el botón para salir. Es
 * donde termina el login y lo que mira el e2e. Sin sesión válida, lo dice y
 * ofrece entrar. No protege nada (eso es F0-32).
 */

import { connection } from "next/server.js";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { FormularioSalir } from "../../_ui/formulario-salir.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Tarjeta } from "../../_ui/tarjeta.tsx";
import { sesionActual } from "../sesion-actual.ts";

export default async function SesionActual() {
  await connection();
  const sesion = await sesionActual();
  if (sesion === null) {
    return (
      <Tarjeta>
        <h1>Sin sesión</h1>
        <p className="mb-4">No hay una sesión abierta en este navegador.</p>
        <a href="/ingresar" className={clasesDeBoton("primario")}>
          Entrar
        </a>
      </Tarjeta>
    );
  }
  const { email, rol } = sesion.usuario;
  return (
    <Marco email={email} rol={rol} rutaActual="/sesion">
      <main>
        <h1>Sesión iniciada</h1>
        <p className="mb-4">
          Entraste como <strong data-email-sesion>{email}</strong> ({rol}).
        </p>
        <FormularioSalir texto="Cerrar sesión" />
      </main>
    </Marco>
  );
}
