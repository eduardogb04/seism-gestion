/**
 * Lo que distingue a esta copia del repo de otra que corre a la vez (otro
 * worktree, otro agente): el nombre del proyecto de compose y de los
 * contenedores de prueba, la etiqueta de la imagen que usan, y un puerto libre
 * de la máquina. Sin esto dos e2e simultáneos se pisan los contenedores, los
 * puertos y, si son de ramas distintas, el código que prueban.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:net";
import process from "node:process";

/**
 * `COMPOSE_PROJECT_NAME` si está definida; si no, `seism-` y un hash corto de
 * la ruta absoluta de esta copia: el mismo nombre en cada corrida, distinto
 * entre copias.
 */
export function nombreProyecto(): string {
  const definido = process.env.COMPOSE_PROJECT_NAME;
  if (definido !== undefined && definido !== "") {
    return definido;
  }
  const hash = createHash("sha256")
    .update(process.cwd())
    .digest("hex")
    .slice(0, 8);
  return `seism-${hash}`;
}

/**
 * La etiqueta de la imagen que usan el e2e y `imagen:prueba` en esta copia del
 * repo. `docker-compose.yml` arma la misma con `${COMPOSE_PROJECT_NAME}:local`.
 */
export function etiquetaImagen(): string {
  return `${nombreProyecto()}:local`;
}

/** Un puerto de 127.0.0.1 que nadie está usando ahora (el que asigna el sistema). */
export function puertoLibre(): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const servidor = createServer();
    servidor.once("error", rechazar);
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address();
      servidor.close(() => {
        if (direccion === null || typeof direccion === "string") {
          rechazar(new Error("no se pudo leer el puerto asignado"));
          return;
        }
        resolver(direccion.port);
      });
    });
  });
}
