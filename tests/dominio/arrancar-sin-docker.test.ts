import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F1-01: `npm run arrancar` sin Docker andando sale con un mensaje en
 * castellano, no con una traza, y no deja nada escrito (el chequeo de Docker
 * va antes que crear `.env`). Se corre el script como proceso hijo; no se
 * tira abajo ningún Docker real: o no está en el PATH o es un ejecutable
 * falso que sale con 1, igual que el motor caído.
 */
const RAIZ = process.cwd();
const ARRANCAR = path.join(RAIZ, "scripts", "arrancar.ts");

function arrancarCon(entorno: Record<string, string>) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...entorno };
  // En Windows la variable se llama `Path`: sin esto el hijo vería dos.
  for (const nombre of Object.keys(env)) {
    if (nombre !== "PATH" && nombre.toUpperCase() === "PATH") {
      delete env[nombre];
    }
  }
  const existiaEnv = existsSync(path.join(RAIZ, ".env"));
  const resultado = spawnSync(process.execPath, [ARRANCAR], {
    cwd: RAIZ,
    encoding: "utf8",
    env,
  });
  return { resultado, existiaEnv };
}

function exigirMensajeDeDockerCaido(
  resultado: SpawnSyncReturns<string>,
  existiaEnv: boolean,
): void {
  expect(resultado.status).toBe(1);
  expect(resultado.stderr).toContain("Docker Desktop");
  expect(resultado.stderr).toContain("npm run arrancar");
  expect(resultado.stderr).not.toMatch(/^\s+at /m);
  expect(existsSync(path.join(RAIZ, ".env"))).toBe(existiaEnv);
}

describe("npm run arrancar sin Docker", () => {
  it("sin el binario de docker en el PATH", () => {
    const { resultado, existiaEnv } = arrancarCon({
      PATH: path.dirname(process.execPath),
    });

    exigirMensajeDeDockerCaido(resultado, existiaEnv);
  });

  // En Windows `spawnSync("docker")` no resuelve un script sin extensión.
  it.skipIf(process.platform === "win32")(
    "con un docker que no responde (sale con 1)",
    () => {
      const carpeta = mkdtempSync(path.join(tmpdir(), "docker-falso-"));
      try {
        const falso = path.join(carpeta, "docker");
        writeFileSync(falso, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
        const { resultado, existiaEnv } = arrancarCon({
          PATH: `${carpeta}${path.delimiter}${process.env.PATH ?? ""}`,
        });

        exigirMensajeDeDockerCaido(resultado, existiaEnv);
      } finally {
        rmSync(carpeta, { recursive: true, force: true });
      }
    },
  );
});
