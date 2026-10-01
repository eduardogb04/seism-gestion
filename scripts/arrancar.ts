/**
 * `npm run arrancar` (F1-01): levanta el sistema en local con un solo paso.
 *
 * Dependencias al día → Docker responde → puerto 3000 libre → `.env` →
 * Postgres de compose → cliente de Prisma → migraciones → semilla → URL y
 * email de prueba → caché de `next dev` borrada → `next dev`. Los tres primeros
 * pasos no escriben nada: si fallan, la máquina queda como estaba.
 * Al cortar con Ctrl+C la base de compose queda levantada.
 *
 * Solo encadena lo que ya existe (`db:migrate`, `db:seed`): ellos validan el
 * entorno. MinIO no se levanta porque `.env.example` usa `ALMACEN=disco`.
 * Nunca instala: si faltan o están viejas las dependencias, pide `npm ci`.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, rmSync, statSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import process from "node:process";
import { BIN_PRISMA } from "./lib/migraciones.ts";

const PUERTO_APP = 3000;
const BIN_NEXT = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

const CACHE_DE_NEXT_DEV = path.join(".next", "dev");

function avisar(texto: string): void {
  process.stdout.write(`${texto}\n`);
}

function cortar(texto: string, codigo = 1): never {
  process.stderr.write(`\n${texto}\n`);
  process.exit(codigo);
}

/** Corre un paso mostrando su salida; si falla, corta nombrándolo. */
function paso(
  nombre: string,
  comando: string,
  argumentos: readonly string[],
): void {
  const resultado = spawnSync(comando, [...argumentos], { stdio: "inherit" });
  if (resultado.status !== 0) {
    cortar(
      `arrancar: falló el paso «${nombre}» (salió ${resultado.status ?? "sin código"}).`,
      resultado.status ?? 1,
    );
  }
}

function dockerResponde(): boolean {
  const resultado = spawnSync("docker", ["info"], { stdio: "ignore" });
  return resultado.error === undefined && resultado.status === 0;
}

/**
 * Se prueba conectando, no escuchando: en Windows un `listen` en 127.0.0.1
 * convive con un servidor que escucha en todas las interfaces (como `next
 * dev`) y no avisaría que el puerto está tomado.
 */
function puertoOcupado(puerto: number): Promise<boolean> {
  return new Promise((resolver) => {
    const conexion = connect(puerto, "127.0.0.1");
    conexion.once("connect", () => {
      conexion.destroy();
      resolver(true);
    });
    conexion.once("error", () => resolver(false));
  });
}

/**
 * `npm ci` deja `node_modules/.package-lock.json`: si el lock del repo es más
 * nuevo, alguien cambió dependencias (o el esquema de Prisma) desde la última
 * instalación.
 */
function dependenciasAlDia(): boolean {
  const instalado = path.join("node_modules", ".package-lock.json");
  return (
    existsSync(BIN_NEXT) &&
    existsSync(instalado) &&
    statSync("package-lock.json").mtimeMs <= statSync(instalado).mtimeMs
  );
}

if (!dependenciasAlDia()) {
  cortar(
    "Faltan las dependencias o están viejas (`node_modules` no está o es anterior a `package-lock.json`).\n" +
      "Corré `npm ci` y volvé a correr `npm run arrancar`.",
  );
}

if (!dockerResponde()) {
  cortar(
    "Docker no está andando.\n" +
      "Abrí Docker Desktop desde el menú Inicio, esperá a que diga «running» y volvé a correr `npm run arrancar`.",
  );
}

if (await puertoOcupado(PUERTO_APP)) {
  cortar(
    `El puerto ${PUERTO_APP} está ocupado.\n` +
      "Lo más probable es otra ventana con `npm run arrancar` o `npm run dev`: cerrala y volvé a correr `npm run arrancar`.",
  );
}

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  avisar("Creé .env a partir de .env.example.");
}

paso("base de datos", "docker", [
  "compose",
  "up",
  "--detach",
  "--wait",
  "postgres",
]);
paso("cliente de Prisma", process.execPath, [BIN_PRISMA, "generate"]);
paso("migraciones", process.execPath, ["scripts/db-migrate.ts"]);
paso("semilla", process.execPath, ["scripts/db-seed.ts"]);

process.loadEnvFile(".env");
avisar(
  `\nLa app queda en http://localhost:${PUERTO_APP}\n` +
    `Para entrar, el email de prueba es ${process.env.ADMIN_INICIAL_EMAIL}\n`,
);

// Una `.next/dev` de otra versión del código hace que `next dev` conteste 404
// en rutas que existen; borrarla solo cuesta unos segundos en el primer arranque.
rmSync(CACHE_DE_NEXT_DEV, { recursive: true, force: true });
avisar("Borré la caché de desarrollo (.next/dev) para empezar limpio.");

const app = spawnSync(process.execPath, [BIN_NEXT, "dev"], {
  stdio: "inherit",
});
process.exit(app.status ?? 1);
