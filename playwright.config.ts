/**
 * El nivel **e2e** (F0-14): un navegador de verdad contra la app levantada con
 * compose. Es el cuarto nivel de test; los otros tres son proyectos de Vitest
 * (`vitest.config.ts`). Por qué el e2e no es un proyecto de Vitest:
 * docs/adr/0014-niveles-de-test.md.
 *
 *   npm run test:e2e            → esta configuración, Chromium
 *   npm run test:e2e -- --ui    → con la interfaz de Playwright (local)
 *
 * `webServer` corre `npm run e2e:app`, que levanta el servicio `app` del
 * perfil `e2e` de `docker-compose.yml` (la imagen que se publica, no
 * `next dev`) y espera su `HEALTHCHECK`; `globalTeardown` lo apaga. En local,
 * si ya hay algo escuchando en el puerto (por ejemplo `npm run dev`),
 * Playwright lo reusa; en CI nunca.
 */

import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

/** Donde escucha la app del perfil `e2e` (`docker-compose.yml`). */
const URL_BASE = "http://127.0.0.1:3000";

/** CI lo define solo; en la máquina de cualquiera no está. */
const EN_CI = process.env.CI !== undefined && process.env.CI !== "";

export default defineConfig({
  testDir: "tests/e2e",
  // Un solo camino de humo: nada que paralelizar, y una sola app levantada.
  fullyParallel: false,
  workers: 1,
  // Sin reintentos: un e2e que pasa "a veces" es un e2e que no dice nada.
  retries: 0,
  // `test.only` olvidado en un commit pone CI en rojo en vez de correr un test.
  forbidOnly: EN_CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: EN_CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: URL_BASE,
    // Una traza de la corrida fallida: se abre con `npx playwright show-trace`.
    trace: "retain-on-failure",
  },
  // Chromium únicamente (criterio de F0-14): es el único navegador que se
  // instala en CI (`npx playwright install chromium`).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run e2e:app",
    // El latido público (P13): responde recién cuando la app está sirviendo.
    url: `${URL_BASE}/api/salud`,
    // Construir la imagen la primera vez tarda; después es levantar y listo.
    timeout: 300_000,
    reuseExistingServer: !EN_CI,
    stdout: "pipe",
    stderr: "pipe",
  },
  globalTeardown: "./tests/e2e/_arnes/apagar-app.ts",
});
