/**
 * La imagen Docker de la app (F0-07): construirla y probarla con un solo
 * comando, igual en CI que en la máquina de cualquiera.
 *
 *   npm run imagen                    → construye `seism-gestion:local`
 *   npm run imagen -- <etiqueta>...   → construye con esas etiquetas (CI)
 *   npm run imagen:prueba             → levanta el contenedor y lo verifica
 *   npm run imagen:prueba -- <etiqueta>
 *
 * `probar` es lo que hace de test de esta tarea: levanta el contenedor,
 * espera a que el `HEALTHCHECK` lo dé por sano, pide `/` y `/api/salud`,
 * verifica que la versión del latido sea la del build, que la imagen no se
 * haya llevado ningún `.env` ni variable de más, y que el tamaño entre en el
 * tope. Cada verificación se informa por separado: un rojo no tapa a otro.
 *
 * No importa nada de `node_modules`: corre con Node pelado (`fetch` y el
 * cliente de Docker), así que sirve aunque no se haya hecho `npm ci`.
 * Decisiones y porqués: docs/adr/0007-imagen-docker.md.
 */

import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";

/** Etiqueta por defecto cuando se construye o se prueba en local. */
const ETIQUETA_LOCAL = "seism-gestion:local";
const CONTENEDOR = "seism-gestion-prueba";
const CONTENEDOR_SIN_ENTORNO = "seism-gestion-prueba-sin-entorno";
const PUERTO = 3000;
/**
 * La app valida `DATABASE_URL` al arrancar (F0-08) pero todavía no se
 * conecta a ninguna base: para la prueba alcanza una URL de Postgres válida y
 * ficticia, a la que nadie se conecta.
 */
const DATABASE_URL_PRUEBA = "postgresql://prueba:prueba@127.0.0.1:5432/prueba";
/** Obligatoria desde F0-30 (el primer administrador): inventada, nadie la usa acá. */
const ADMIN_INICIAL_EMAIL_PRUEBA = "admin@ejemplo.test";
/** Objetivo de tamaño de la imagen final (criterio de F0-07). */
const TOPE_MB = 250;
const ESPERA_MAXIMA_MS = 120_000;
const INTERVALO_MS = 2_000;

/**
 * Las únicas variables que puede tener la imagen final: las tres de la imagen
 * oficial de Node y las cuatro que declara el `Dockerfile`. Cualquier otra es
 * un valor que se coló al construir (ver `.dockerignore`).
 */
const VARIABLES_PERMITIDAS = new Set([
  "PATH",
  "NODE_VERSION",
  "YARN_VERSION",
  "NEXT_TELEMETRY_DISABLED",
  "NODE_ENV",
  "PORT",
  "HOSTNAME",
]);

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
      `\nERROR: no se pudo ejecutar 'docker ${argumentos.join(" ")}'. ¿Está Docker instalado y corriendo? (RUNBOOK, sección 14)`,
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

/** Corre `docker` y devuelve su salida estándar. */
function dockerCapturar(argumentos: readonly string[]): string {
  return execFileSync("docker", [...argumentos], { encoding: "utf8" });
}

/** Borra un contenedor si existe. No falla si no existe. */
function borrarContenedor(nombre: string): void {
  spawnSync("docker", ["rm", "--force", nombre], { stdio: "ignore" });
}

/**
 * La versión que va a devolver `GET /api/salud`: `APP_VERSION` si viene
 * definida (es lo que hace CI, con el SHA corto del commit) o, si no, el SHA
 * corto de git. Sin ninguna de las dos no se construye: la imagen no tiene
 * `.git` adentro y no podría resolverla (ADR 0005).
 */
function resolverVersion(): string {
  const delEntorno = process.env.APP_VERSION;
  if (delEntorno !== undefined && delEntorno !== "") {
    return delEntorno;
  }
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    console.error(
      "\nERROR: no se pudo resolver la versión: APP_VERSION no está definida y no se pudo leer el SHA de git. Definí APP_VERSION antes de construir.",
    );
    process.exit(1);
  }
}

function construir(etiquetas: readonly string[]): void {
  const version = resolverVersion();
  const destinos = etiquetas.length > 0 ? etiquetas : [ETIQUETA_LOCAL];

  console.log(`Construyendo ${destinos.join(", ")} con APP_VERSION=${version}`);
  const argumentos = [
    "build",
    // Solo x86_64: el servidor del deploy lo es. Multi-arch queda documentado
    // como una línea comentada en el Dockerfile.
    "--platform",
    "linux/amd64",
    "--build-arg",
    `APP_VERSION=${version}`,
  ];
  for (const destino of destinos) {
    argumentos.push("--tag", destino);
  }
  argumentos.push(".");

  docker(argumentos);
  console.log(`\nOK: imagen construida (${destinos.join(", ")}).`);
}

/** Espera a que el `HEALTHCHECK` del contenedor lo dé por sano. */
async function esperarSaludable(): Promise<void> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  let estado = "";
  while (Date.now() < limite) {
    estado = dockerCapturar([
      "inspect",
      "--format",
      "{{.State.Health.Status}}/{{.State.Running}}",
      CONTENEDOR,
    ]).trim();
    if (estado === "healthy/true") {
      console.log("HEALTHCHECK: healthy.");
      return;
    }
    if (estado.endsWith("/false")) {
      break;
    }
    await dormir(INTERVALO_MS);
  }
  console.error(`\n--- docker logs ${CONTENEDOR} ---`);
  docker(["logs", CONTENEDOR]);
  console.error(
    `\nERROR: el contenedor nunca quedó 'healthy' (último estado: ${estado}).`,
  );
  borrarContenedor(CONTENEDOR);
  process.exit(1);
}

/** `/` y `/api/salud`, servidos por el contenedor. */
async function verificarRespuestas(version: string): Promise<string[]> {
  const problemas: string[] = [];
  const base = `http://127.0.0.1:${PUERTO}`;

  const inicio = await fetch(`${base}/`);
  const html = await inicio.text();
  console.log(`GET / → ${inicio.status}`);
  if (!inicio.ok || !html.includes("SeisM")) {
    problemas.push(`GET / devolvió ${inicio.status} y un cuerpo inesperado.`);
  }

  const salud = await fetch(`${base}/api/salud`);
  const cuerpo: unknown = await salud.json();
  console.log(`GET /api/salud → ${salud.status} ${JSON.stringify(cuerpo)}`);
  const esperado = JSON.stringify({ ok: true, version });
  if (!salud.ok || JSON.stringify(cuerpo) !== esperado) {
    problemas.push(
      `GET /api/salud devolvió ${salud.status} ${JSON.stringify(cuerpo)}; se esperaba 200 ${esperado}.`,
    );
  }

  return problemas;
}

/**
 * Que la imagen no se haya llevado secretos. Tres preguntas distintas:
 * ningún archivo `.env` adentro, ninguna variable de más en la configuración,
 * y ninguna mención a `.env` en las capas. Y una cuarta, la que más vale: sin
 * `APP_ENTORNO` en el entorno del proceso, el contenedor **no arranca**; si
 * arrancara, es que se llevó un `.env` adentro (ADR 0005).
 */
function verificarSinSecretos(etiqueta: string): string[] {
  const problemas: string[] = [];

  const archivos = dockerCapturar([
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    etiqueta,
    "-c",
    "find / -xdev -name '.env*' -print 2>/dev/null || true",
  ]).trim();
  console.log(
    `Archivos .env adentro de la imagen: ${archivos === "" ? "ninguno" : archivos}`,
  );
  if (archivos !== "") {
    problemas.push(`La imagen tiene archivos de entorno adentro: ${archivos}`);
  }

  const crudo: unknown = JSON.parse(
    dockerCapturar([
      "image",
      "inspect",
      "--format",
      "{{json .Config.Env}}",
      etiqueta,
    ]),
  );
  const variables: string[] = Array.isArray(crudo)
    ? crudo.map((entrada: unknown) => String(entrada))
    : [];
  console.log(`Variables de la imagen: ${variables.join(" ")}`);
  for (const variable of variables) {
    const nombre = variable.split("=")[0] ?? "";
    if (!VARIABLES_PERMITIDAS.has(nombre)) {
      problemas.push(
        `La imagen declara la variable '${nombre}', que no está en la lista de permitidas.`,
      );
    }
  }

  const capas = dockerCapturar([
    "history",
    "--no-trunc",
    "--format",
    "{{.CreatedBy}}",
    etiqueta,
  ]);
  // `process.env.PORT`, del HEALTHCHECK, no es un archivo de entorno: se saca
  // antes de buscar, para que el control no cante un falso positivo.
  const capasConEnv = capas
    .split("\n")
    .map((capa) => capa.replaceAll("process.env", ""))
    .filter((capa) => capa.toLowerCase().includes(".env"));
  if (capasConEnv.length > 0) {
    problemas.push(
      `Alguna capa de la imagen menciona un archivo .env: ${capasConEnv.join(" | ")}`,
    );
  }

  borrarContenedor(CONTENEDOR_SIN_ENTORNO);
  const sinEntorno = spawnSync(
    "docker",
    ["run", "--name", CONTENEDOR_SIN_ENTORNO, etiqueta],
    { encoding: "utf8", timeout: 30_000 },
  );
  borrarContenedor(CONTENEDOR_SIN_ENTORNO);
  const salida = `${sinEntorno.stdout ?? ""}${sinEntorno.stderr ?? ""}`;
  console.log(
    `Sin APP_ENTORNO ni DATABASE_URL el contenedor salió ${sinEntorno.status}: ${salida.trim()}`,
  );
  if (
    sinEntorno.status !== 1 ||
    !salida.includes("APP_ENTORNO") ||
    !salida.includes("DATABASE_URL")
  ) {
    problemas.push(
      "Sin APP_ENTORNO ni DATABASE_URL el contenedor tendría que salir 1 nombrando las dos variables que faltan; no lo hizo (¿se coló un .env adentro?).",
    );
  }

  return problemas;
}

function verificarTamano(etiqueta: string): string[] {
  const bytes = Number(
    dockerCapturar([
      "image",
      "inspect",
      "--format",
      "{{.Size}}",
      etiqueta,
    ]).trim(),
  );
  const mb = Math.round(bytes / 1_000_000);
  console.log(`Tamaño de la imagen final: ${mb} MB (tope ${TOPE_MB} MB).`);
  return mb > TOPE_MB
    ? [`La imagen pesa ${mb} MB y el tope son ${TOPE_MB} MB.`]
    : [];
}

async function probar(etiqueta: string): Promise<void> {
  const version = resolverVersion();
  console.log(`Probando ${etiqueta} (versión esperada: ${version})`);

  borrarContenedor(CONTENEDOR);
  docker([
    "run",
    "--detach",
    "--name",
    CONTENEDOR,
    "--publish",
    `${PUERTO}:3000`,
    "--env",
    "APP_ENTORNO=ci",
    "--env",
    `DATABASE_URL=${DATABASE_URL_PRUEBA}`,
    "--env",
    `ADMIN_INICIAL_EMAIL=${ADMIN_INICIAL_EMAIL_PRUEBA}`,
    etiqueta,
  ]);

  const problemas: string[] = [];
  try {
    await esperarSaludable();
    problemas.push(...(await verificarRespuestas(version)));
    problemas.push(...verificarSinSecretos(etiqueta));
    problemas.push(...verificarTamano(etiqueta));
  } finally {
    console.log(`\n--- docker logs ${CONTENEDOR} ---`);
    docker(["logs", CONTENEDOR]);
    borrarContenedor(CONTENEDOR);
  }

  if (problemas.length > 0) {
    console.error("\nERROR: la imagen no pasó estas verificaciones:");
    for (const problema of problemas) {
      console.error(`- ${problema}`);
    }
    process.exit(1);
  }
  console.log(
    "\nOK: el contenedor sirve / y /api/salud con la versión del build, no se llevó ningún .env y entra en el tope de tamaño.",
  );
}

async function main(): Promise<void> {
  const [modo, ...resto] = process.argv.slice(2);

  if (modo === "construir") {
    construir(resto);
    return;
  }
  if (modo === "probar") {
    await probar(resto[0] ?? ETIQUETA_LOCAL);
    return;
  }

  console.error(
    "Uso: node scripts/imagen.ts construir [etiqueta...] | probar [etiqueta]",
  );
  process.exit(1);
}

await main();
