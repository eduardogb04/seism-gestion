/**
 * Inicio de la administración (F0-32): la puerta a las pantallas para
 * administradores. Como toda página de `/administracion/**`, lo primero que
 * hace es exigir administrador (`accesoDeAdministrador`, ADR 0028).
 */

import { accesoDeAdministrador } from "../(auth)/sesion-actual.ts";
import { ErrorEnPantalla } from "./error-en-pantalla.tsx";

export default async function Administracion() {
  const acceso = await accesoDeAdministrador();
  if (acceso.tipo === "prohibido") {
    return (
      <main>
        <h1>Administración</h1>
        <ErrorEnPantalla error={acceso.error} />
      </main>
    );
  }
  return (
    <main>
      <h1>Administración</h1>
      <ul>
        <li>
          <a href="/administracion/usuarios">Usuarios</a>
        </li>
      </ul>
    </main>
  );
}
