/**
 * Inicio de la administración (F0-32): la puerta a las pantallas para
 * administradores. Como toda página de `/administracion/**`, lo primero que
 * hace es exigir administrador (`accesoDeAdministrador`, ADR 0028).
 */

import { ErrorEnPantalla } from "../_ui/error-en-pantalla.tsx";
import { Marco } from "../_ui/marco.tsx";
import { Tarjeta } from "../_ui/tarjeta.tsx";
import { accesoDeAdministrador } from "../(auth)/sesion-actual.ts";

export default async function Administracion() {
  const acceso = await accesoDeAdministrador();
  if (acceso.tipo === "prohibido") {
    return (
      <Tarjeta>
        <h1>Administración</h1>
        <ErrorEnPantalla error={acceso.error} />
      </Tarjeta>
    );
  }
  const { email, rol } = acceso.sesion.usuario;
  return (
    <Marco email={email} rol={rol} rutaActual="/administracion">
      <main>
        <h1>Administración</h1>
        <ul>
          <li>
            <a href="/administracion/usuarios">Usuarios</a>
          </li>
        </ul>
      </main>
    </Marco>
  );
}
