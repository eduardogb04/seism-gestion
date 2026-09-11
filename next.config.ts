/**
 * Configuración de Next.js (F0-04).
 *
 * - `output: "standalone"`: el build deja en `.next/standalone/` un
 *   `server.js` con solo lo necesario para correr. Es lo que va a copiar la
 *   imagen Docker (F0-07).
 * - `env.APP_VERSION`: la versión que devuelve `GET /api/salud`. Se resuelve
 *   acá, al compilar (`APP_VERSION` si viene definida, si no el SHA corto de
 *   git; sin ninguna, el build falla) y Next reemplaza `process.env.APP_VERSION`
 *   por su valor literal en el código compilado. Solo en `next build` y
 *   `next dev`: el servidor de producción corre lo ya compilado y no vuelve a
 *   preguntarle a git (ADR 0005).
 * - `agentRules: false`: sin esto, `next dev` detecta si lo corre un agente
 *   de IA y escribe un bloque propio (en inglés) dentro de `AGENTS.md`, y
 *   crea `CLAUDE.md` si falta. `AGENTS.md` lo escribimos nosotros; lo útil de
 *   ese bloque (leer la documentación de Next que viene en
 *   `node_modules/next/dist/docs/`) ya está dicho ahí (ADR 0005).
 *
 * El entorno (`APP_ENTORNO`...) NO se valida acá: se valida al arrancar, en
 * `src/instrumentation.ts`, para que compilar no necesite `.env`.
 */

import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants.js";
import { resolverVersion } from "./src/infraestructura/version.ts";

function leerShaGit(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Sin git o sin `.git` (por ejemplo, dentro del build de Docker):
    // `resolverVersion` decide qué hacer.
    return undefined;
  }
}

export default function configuracion(fase: string): NextConfig {
  const config: NextConfig = { output: "standalone", agentRules: false };

  if (fase === PHASE_PRODUCTION_BUILD || fase === PHASE_DEVELOPMENT_SERVER) {
    const resultado = resolverVersion(process.env.APP_VERSION, leerShaGit);
    if (!resultado.ok) {
      throw new Error(resultado.mensaje);
    }
    config.env = { APP_VERSION: resultado.version };
  }

  return config;
}
