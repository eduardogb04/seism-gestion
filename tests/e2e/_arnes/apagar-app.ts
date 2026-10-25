/**
 * El cierre del e2e (F0-14): `globalTeardown` de `playwright.config.ts`.
 *
 * Borra **solo** los contenedores `app` y `postgres-e2e` del perfil `e2e` de
 * este proyecto de compose (`COMPOSE_PROJECT_NAME`, que fijó
 * `playwright.config.ts`: el de esta copia del repo, no el de otro worktree
 * que corra su e2e a la vez), con `--stop --force --volumes` (la base del e2e
 * es descartable, F0-31), así la corrida no deja nada levantado. No toca el
 * servicio `postgres` de compose ni su volumen: la base de desarrollo de quien
 * corrió el e2e queda como estaba.
 *
 * Después borra la red `<proyecto>_default` (M-20): sin eso cada corrida deja
 * una y Docker se queda sin subredes. Se borra con `docker network rm` y no
 * con `docker compose down`, que bajaría también el Postgres de desarrollo; si
 * la red sigue en uso por ese Postgres, o ya no está, avisa y sigue.
 */

import { spawnSync } from "node:child_process";
import { nombreProyecto } from "../../../scripts/lib/instancia.ts";

export function comandoBorrarRed(proyecto: string): string[] {
  return ["network", "rm", `${proyecto}_default`];
}

interface ResultadoDeRed {
  status: number | null;
  stderr: string;
  error?: Error;
}

/** La línea que el cierre imprime por la red, o `undefined` si se borró. */
export function informeDeRed(
  red: string,
  resultado: ResultadoDeRed,
): string | undefined {
  if (resultado.error === undefined && resultado.status === 0) {
    return undefined;
  }
  const detalle = resultado.error?.message ?? resultado.stderr.trim();
  if (resultado.error === undefined) {
    if (detalle.includes("has active endpoints")) {
      return `La red ${red} sigue en uso (¿el Postgres de desarrollo del mismo proyecto?): no se borra.`;
    }
    if (detalle.includes("not found")) {
      return `La red ${red} no existe: no hay nada que borrar.`;
    }
  }
  return `No se pudo borrar la red ${red}: ${detalle}. Borrala con 'docker network rm ${red}' (RUNBOOK, sección 16).`;
}

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

  const comando = comandoBorrarRed(nombreProyecto());
  const red = comando[comando.length - 1] ?? "";
  const borrado = spawnSync("docker", comando, {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  const aviso = informeDeRed(red, {
    status: borrado.status,
    stderr: borrado.stderr ?? "",
    ...(borrado.error === undefined ? {} : { error: borrado.error }),
  });
  if (aviso !== undefined) {
    console.error(aviso);
  }
}
