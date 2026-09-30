/**
 * `/salud` (F0-26): el panel de salud del sistema. Solo para administradores:
 * lo primero que hace es exigir el rol (`accesoDeAdministrador`, F0-32,
 * ADR 0028), antes de leer ningún dato. `/api/salud`, el latido público del
 * deploy, es otra cosa y sigue abierta.
 */

import { armado } from "../../infraestructura/arranque/armado.ts";
import { accesoDeAdministrador } from "../(auth)/sesion-actual.ts";
import { ErrorEnPantalla } from "../administracion/error-en-pantalla.tsx";
import { PanelSalud } from "./panel-salud.tsx";

export default async function Salud() {
  const acceso = await accesoDeAdministrador();
  if (acceso.tipo === "prohibido") {
    return (
      <main>
        <h1>Salud</h1>
        <ErrorEnPantalla error={acceso.error} />
      </main>
    );
  }
  return <PanelSalud salud={await armado().salud()} />;
}
