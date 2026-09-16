/**
 * Control de nombres prohibidos (repo público, F0: en un PR se colaron
 * nombres reales de clientes; ver AGENTS.md, sección *Nombres prohibidos*,
 * para el mecanismo completo). Ningún archivo **versionado** puede nombrar un
 * cliente, proyecto o persona real de SeisM.
 *
 * Alcance: `git ls-files -z` (lo que ya excluye git, `node_modules/`
 * incluido, cuenta como si no existiera), menos `package-lock.json` (enorme,
 * y no hay nombres propios ahí) y `tests/fixtures/nombres-prohibidos/`
 * (fixtures que TIENEN que violar este control a propósito — `npm run
 * nombres-prohibidos:fixtures` los prueba aparte). Un archivo que no es texto
 * UTF-8 válido (`readFileSync` tira `ERR_INVALID_UTF8` o devuelve caracteres
 * de reemplazo `�` que igual no arman ninguna frase con hash conocido)
 * se saltea: no hay nombre de cliente adentro de un binario.
 *
 * La detección (`scripts/lib/deteccion-nombres.ts`) compara *hashes*, nunca
 * texto en claro: este script no sabe qué nombre corresponde a qué hash.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { encontrarCoincidencias } from "./lib/deteccion-nombres.ts";
import { TERMINOS_PROHIBIDOS } from "./lib/nombres-prohibidos-datos.ts";

const EXCLUIDOS = new Set(["package-lock.json"]);
const PREFIJO_FIXTURES_PROPIOS = "tests/fixtures/nombres-prohibidos/";

/** Rutas versionadas (relativas a la raíz), sin las que este control excluye. */
function archivosVersionados(): string[] {
  const salida = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  });
  return salida
    .split("\0")
    .filter((ruta) => ruta !== "")
    .filter((ruta) => !EXCLUIDOS.has(ruta))
    .filter((ruta) => !ruta.startsWith(PREFIJO_FIXTURES_PROPIOS));
}

/** El contenido como texto, o `undefined` si no se pudo leer como UTF-8. */
function leerComoTexto(ruta: string): string | undefined {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return undefined;
  }
}

function main(): void {
  const archivos = archivosVersionados();
  let huboCoincidencia = false;

  for (const ruta of archivos) {
    const contenido = leerComoTexto(ruta);
    if (contenido === undefined) {
      continue;
    }

    const coincidencias = encontrarCoincidencias(
      contenido,
      TERMINOS_PROHIBIDOS,
    );
    for (const { linea, hash } of coincidencias) {
      huboCoincidencia = true;
      console.error(
        `${ruta}:${linea}: término prohibido (hash ${hash.slice(0, 12)}…). ` +
          "Nombre real de cliente, proyecto o persona: no puede ir en un repo público " +
          '(ver AGENTS.md, sección "Nombres prohibidos").',
      );
    }
  }

  if (huboCoincidencia) {
    console.error(
      "\nnombres-prohibidos: encontró texto prohibido en archivos versionados. " +
        "Sacalo antes de subir. Si es un falso positivo, revisá " +
        "scripts/lib/nombres-prohibidos-datos.ts y AGENTS.md.",
    );
    process.exit(1);
  }

  console.log(
    `nombres-prohibidos: sin coincidencias en ${archivos.length} archivos versionados.`,
  );
  process.exit(0);
}

main();
