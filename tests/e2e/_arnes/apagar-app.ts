/**
 * El cierre del e2e (F0-14): `globalTeardown` de `playwright.config.ts`.
 *
 * Borra **solo** los contenedores `app` y `postgres-e2e` del perfil `e2e`
 * (`--stop --force --volumes`: la base del e2e es descartable, F0-31), así la
 * corrida no deja nada levantado. No toca el servicio `postgres` de compose
 * ni su volumen: la base de desarrollo de quien corrió el e2e queda como
 * estaba.
 *
 * Si `webServer` reusó un servidor que ya estaba (en local, `npm run dev`),
 * no hay contenedor que borrar y el comando no hace nada.
 */

import { spawnSync } from "node:child_process";

export default function apagarApp(): void {
  const resultado = spawnSync(
    "docker",
    [
      "compose",
      "--profile",
      "e2e",
      "rm",
      "--stop",
      "--force",
      "--volumes",
      "app",
      "postgres-e2e",
    ],
    { stdio: "inherit" },
  );
  if (resultado.error !== undefined) {
    console.error(
      `No se pudo apagar la app del e2e: ${resultado.error.message}. Borralas con 'docker compose --profile e2e rm --stop --force --volumes app postgres-e2e' (RUNBOOK, sección 16).`,
    );
  }
}
