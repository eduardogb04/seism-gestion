/**
 * `npm run verificar` (M-01): junta en un solo comando lo que antes eran
 * cuatro sueltos (`typecheck`, `lint`, `limites`, `test`) más los `*:fixtures`
 * que existan, y le muestra al agente una sola línea por paso en vez de
 * volcarle 80-140 KB de salida al contexto.
 *
 * Orden: `typecheck`, `lint`, `limites`, `test` y después cada script de
 * `package.json` cuyo nombre termine en `:fixtures`, en el orden en que
 * aparecen en el objeto `scripts` (se leen de ahí en tiempo de ejecución,
 * nunca a mano). Cada paso corre como `npm run <paso>`, con su salida
 * completa (stdout + stderr) en `.verificar/<paso>.log` (los `:` del nombre
 * se cambian por `-`); a la consola solo va una línea de resultado, y las
 * últimas 60 líneas de un paso que falló.
 *
 * Sin argumentos: para en el primer `✘`, sale 1. Con `-- --seguir`: corre
 * todos igual, imprime las 60 líneas de cada uno que falla apenas falla, y al
 * final una línea con cuántos de cuántos fallaron; sale 1 si falló alguno.
 * Cualquier otro argumento: mensaje de uso y sale 2.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const RAIZ = process.cwd();
const DIR_LOGS = path.join(RAIZ, ".verificar");
const TOPE_LINEAS_FALLO = 60;

interface Paquete {
  readonly scripts?: Readonly<Record<string, string>>;
}

/** El comando de `npm` según la plataforma: en Windows es `npm.cmd`. */
function comandoNpm(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

/**
 * `typecheck`, `lint`, `limites`, `test` y después cada `*:fixtures` de
 * `package.json`, en el orden del archivo. Nunca una lista a mano.
 */
function pasosAVerificar(): readonly string[] {
  const paquete: Paquete = JSON.parse(
    readFileSync(path.join(RAIZ, "package.json"), "utf8"),
  );
  const nombresScripts = Object.keys(paquete.scripts ?? {});
  const fixtures = nombresScripts.filter((nombre) =>
    nombre.endsWith(":fixtures"),
  );
  return ["typecheck", "lint", "limites", "test", ...fixtures];
}

interface ResultadoPaso {
  readonly paso: string;
  readonly exito: boolean;
  readonly segundos: number;
  readonly salida: string;
}

/** `npm run <paso>`, con su salida completa a `.verificar/<paso>.log`. */
function correrPaso(paso: string): Promise<ResultadoPaso> {
  return new Promise((resolver) => {
    const inicio = Date.now();
    const trozos: Buffer[] = [];

    // `paso` sale siempre de `pasosAVerificar()` (nombres fijos o claves de
    // `package.json`): nunca un argumento externo. Con `shell: true`, Node
    // no escapa un array de argumentos (DEP0190) — por eso va todo en un
    // único string de comando.
    const proceso = spawn(`${comandoNpm()} run ${paso}`, {
      cwd: RAIZ,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    proceso.stdout.on("data", (trozo: Buffer) => trozos.push(trozo));
    proceso.stderr.on("data", (trozo: Buffer) => trozos.push(trozo));

    proceso.on("close", (codigo) => {
      const segundos = (Date.now() - inicio) / 1000;
      const salida = Buffer.concat(trozos).toString("utf8");

      mkdirSync(DIR_LOGS, { recursive: true });
      const nombreArchivo = `${paso.replaceAll(":", "-")}.log`;
      writeFileSync(path.join(DIR_LOGS, nombreArchivo), salida);

      resolver({ paso, exito: codigo === 0, segundos, salida });
    });
  });
}

/** `3,4` en vez de `3.4`: segundos con un decimal y coma decimal. */
function formatearSegundos(segundos: number): string {
  return segundos.toFixed(1).replace(".", ",");
}

function imprimirUltimasLineas(salida: string): void {
  const lineas = salida.split("\n");
  const desde = Math.max(0, lineas.length - TOPE_LINEAS_FALLO);
  console.log(lineas.slice(desde).join("\n"));
}

function mensajeUso(): void {
  console.error(
    "Uso: npm run verificar [-- --seguir]\n\n" +
      "Sin argumentos: corre typecheck, lint, limites, test y los *:fixtures, " +
      "y para en el primer paso que falla.\n" +
      "--seguir: corre todos los pasos igual y sale 1 si falló alguno.",
  );
}

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const seguir = argumentos.includes("--seguir");
  const argumentosDesconocidos = argumentos.filter((a) => a !== "--seguir");

  if (argumentosDesconocidos.length > 0) {
    mensajeUso();
    process.exit(2);
  }

  const pasos = pasosAVerificar();
  let fallaron = 0;

  for (const paso of pasos) {
    const resultado = await correrPaso(paso);
    const marca = resultado.exito ? "✔" : "✘";
    console.log(
      `${marca} ${resultado.paso} (${formatearSegundos(resultado.segundos)} s)`,
    );

    if (!resultado.exito) {
      fallaron += 1;
      imprimirUltimasLineas(resultado.salida);

      if (!seguir) {
        process.exit(1);
      }
    }
  }

  if (fallaron > 0) {
    console.log(`✘ ${fallaron} de ${pasos.length} pasos fallaron`);
    process.exit(1);
  }
}

main();
