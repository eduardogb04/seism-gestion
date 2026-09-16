/**
 * La app levantada con compose para el e2e (F0-14).
 *
 *   npm run e2e:app
 *
 * No se llama a mano: es el `webServer` de `playwright.config.ts`.
 *
 * 1. Construye la imagen (`npm run imagen`, F0-07) **siempre**: el e2e prueba
 *    el código de ahora, no la imagen que haya quedado de otra rama. Docker
 *    reusa las capas, así que si nada cambió tarda segundos (en CI la acaba de
 *    construir el paso `imagen`).
 * 2. Levanta con eso el servicio `app` del perfil `e2e` de
 *    `docker-compose.yml` —la **imagen que se publica**, no `next dev`—.
 * 3. Espera a que el latido (`/api/salud`, P13) responda, y recién ahí termina:
 *    Playwright da por levantado el servidor cuando este proceso sale con la
 *    URL ya respondiendo. Si no responde a tiempo, muestra el log del
 *    contenedor y sale 1.
 *
 * Quien la apaga es `tests/e2e/_arnes/apagar-app.ts`, el `globalTeardown` de
 * Playwright: borra **solo** el contenedor `app`, sin tocar el Postgres de
 * compose ni su volumen.
 *
 * Corre con Node pelado, sin nada de `node_modules`.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

/** La imagen que levanta el servicio `app` de compose. */
const IMAGEN = "seism-gestion:local";
/** El script que construye esa imagen (F0-07). */
const CONSTRUCTOR = path.join(process.cwd(), "scripts", "imagen.ts");
/** El latido que dice que la app está sirviendo (P13). */
const URL_SALUD = "http://127.0.0.1:3000/api/salud";
const ESPERA_MAXIMA_MS = 120_000;
const INTERVALO_MS = 1_000;

function dormir(ms: number): Promise<void> {
  return new Promise((seguir) => {
    setTimeout(seguir, ms);
  });
}

/** Corre `docker` mostrando su salida; si falla, corta. */
function docker(argumentos: readonly string[]): void {
  const resultado = spawnSync("docker", [...argumentos], { stdio: "inherit" });
  if (resultado.error !== undefined) {
    console.error(
      `\nERROR: no se pudo ejecutar 'docker ${argumentos.join(" ")}'. ¿Está Docker instalado y corriendo? (RUNBOOK, sección 16)`,
    );
    process.exit(1);
  }
  if (resultado.status !== 0) {
    console.error(
      `\nERROR: 'docker ${argumentos.join(" ")}' salió ${resultado.status}.`,
    );
    process.exit(1);
  }
}

/** ¿Ya responde el latido? */
async function responde(): Promise<boolean> {
  try {
    const respuesta = await fetch(URL_SALUD);
    return respuesta.ok;
  } catch {
    return false;
  }
}

const construccion = spawnSync(process.execPath, [CONSTRUCTOR, "construir"], {
  stdio: "inherit",
});
if (construccion.status !== 0) {
  console.error(
    `\nERROR: no se pudo construir ${IMAGEN}; sin imagen no hay e2e.`,
  );
  process.exit(1);
}

console.log(`Levantando la app del perfil e2e (${IMAGEN}) con compose.`);
docker(["compose", "--profile", "e2e", "up", "--detach", "app"]);

const limite = Date.now() + ESPERA_MAXIMA_MS;
while (Date.now() < limite) {
  if (await responde()) {
    console.log(`La app responde en ${URL_SALUD}.`);
    process.exit(0);
  }
  await dormir(INTERVALO_MS);
}

console.error(
  `\nERROR: la app no respondió ${URL_SALUD} en ${ESPERA_MAXIMA_MS / 1000} s. El log del contenedor:`,
);
spawnSync("docker", ["compose", "--profile", "e2e", "logs", "app"], {
  stdio: "inherit",
});
process.exit(1);
