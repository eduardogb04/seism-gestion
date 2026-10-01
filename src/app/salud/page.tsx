/**
 * `/salud` (F0-26): el panel de salud del sistema. Solo para administradores:
 * lo primero que hace es exigir el rol (`accesoDeAdministrador`, F0-32,
 * ADR 0028), antes de leer ningún dato. `/api/salud`, el latido público del
 * deploy, es otra cosa y sigue abierta.
 */

import { armado } from "../../infraestructura/arranque/armado.ts";
import { ErrorEnPantalla } from "../_ui/error-en-pantalla.tsx";
import { Marco } from "../_ui/marco.tsx";
import { Tarjeta } from "../_ui/tarjeta.tsx";
import { accesoDeAdministrador } from "../(auth)/sesion-actual.ts";
import { PanelSalud } from "./panel-salud.tsx";

export default async function Salud() {
  const acceso = await accesoDeAdministrador();
  if (acceso.tipo === "prohibido") {
    return (
      <Tarjeta>
        <h1>Salud</h1>
        <ErrorEnPantalla error={acceso.error} />
      </Tarjeta>
    );
  }
  const { email, rol } = acceso.sesion.usuario;
  return (
    <Marco email={email} rol={rol} rutaActual="/salud">
      <PanelSalud salud={await armado().salud()} />
    </Marco>
  );
}
