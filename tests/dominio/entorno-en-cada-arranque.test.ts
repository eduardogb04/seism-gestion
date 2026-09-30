import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validarEntorno } from "../../src/infraestructura/entorno.ts";

/**
 * M-04: toda variable obligatoria del entorno está en cada lugar que arranca
 * un proceso con un entorno propio.
 *
 * Tres veces (F0-30, F0-31, F0-27) una variable obligatoria se sumó al esquema
 * (`src/infraestructura/entorno.ts`) y a la app, pero no al worker, a
 * `imagen:prueba` o al e2e: CI se puso rojo recién al juntar las ramas. Este
 * test arma, para cada lugar, el mapa nombre -> valor de lo que ese lugar
 * pasa, y exige que `validarEntorno` lo acepte. Si no, falla nombrando el
 * **lugar** y la **variable**.
 *
 * Los lugares (los mismos que lista AGENTS.md, en *Cómo se agrega...una
 * variable de entorno*):
 * - `docker-compose.yml`: el `environment` de los servicios `app` y `worker`.
 * - `.github/workflows/ci.yml`: el `env` (del paso y del job) de cada paso que
 *   corre `npm run db:*`.
 * - `scripts/imagen.ts`: cada `docker run` de la app y del worker con `--env`.
 * - `scripts/e2e-app.ts`: el entorno con que migra y siembra la base del e2e.
 * - `.env.example`.
 *
 * Los tests de `tests/` que arman un `Entorno` tipado no entran: el tipo
 * `Entorno` ya obliga a que estén todas, y lo controla el compilador.
 *
 * Nada de esto parsea con una librería: `yaml` está en `node_modules` solo
 * como dependencia transitiva y no se importa. Cada extractor es un recorrido
 * simple por líneas (o por el arreglo de `docker run`), con su propio test de
 * más abajo sobre un texto de ejemplo: si un cambio de formato lo rompe, el
 * error dice qué extractor es, no "falta una variable".
 *
 * Nivel dominio: lee archivos con `node:fs`, no abre red.
 */

type Variables = Record<string, string>;

interface Lugar {
  /** Identifica el lugar para la lista de excepciones. */
  readonly clave: string;
  /** Lo que se le muestra a quien rompió algo: archivo y qué es. */
  readonly nombre: string;
  readonly variables: Variables;
}

/**
 * Lo que un lugar arranca **a propósito** sin una variable. Cada excepción
 * nombra el lugar (por su clave), la **única** variable que falta y el motivo.
 * El test afirma que ahí falta exactamente esa y ninguna otra.
 */
const EXCEPCIONES: readonly {
  readonly clave: string;
  readonly variableAusente: string;
  readonly motivo: string;
}[] = [
  {
    clave: "imagen:worker:primer-plano",
    variableAusente: "DATABASE_URL",
    motivo:
      "imagen:prueba verifica que el worker sin DATABASE_URL no arranca: sale distinto de 0 nombrando la variable.",
  },
];

/**
 * Un valor válido por variable, para cuando el lugar no da uno literal: una
 * interpolación que el archivo no resuelve (`${puerto}`, `${{ secrets.X }}`) o
 * un valor vacío (`NOMBRE=` en `.env.example`). Lo que se prueba es que el
 * **nombre** esté. Todos inventados.
 */
const EJEMPLOS: Readonly<Variables> = {
  APP_ENTORNO: "local",
  DATABASE_URL: "postgresql://usuario:clave@localhost:5432/base",
  LOG_NIVEL: "info",
  ADMIN_INICIAL_EMAIL: "admin@ejemplo.test",
  IDENTIDAD: "falsa",
  GOOGLE_CLIENT_ID: "cliente-de-ejemplo",
  GOOGLE_CLIENT_SECRET: "secreto-de-ejemplo",
  APP_URL_PUBLICA: "http://localhost:3000",
  ALMACEN: "disco",
  ALMACEN_DIRECTORIO: ".almacen",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "bucket-de-ejemplo",
  S3_ACCESS_KEY: "acceso-de-ejemplo",
  S3_SECRET_KEY: "clave-de-ejemplo",
  S3_REGION: "auto",
};

// --- Piezas comunes de los extractores ---------------------------------------

function lineasDe(texto: string): string[] {
  return texto.split(/\r?\n/);
}

function sangria(linea: string): number {
  return linea.length - linea.trimStart().length;
}

/** Una línea en blanco o de comentario: no cuenta para la estructura. */
function esRelleno(linea: string): boolean {
  const recortada = linea.trim();
  return recortada === "" || recortada.startsWith("#");
}

/**
 * Las líneas (sin relleno) que cuelgan de la línea `indice`: todas las
 * siguientes con más sangría que ella, hasta la primera que no.
 */
function hijosDeLinea(lineas: readonly string[], indice: number): string[] {
  const base = sangria(lineas[indice] ?? "");
  const hijos: string[] = [];
  for (const linea of lineas.slice(indice + 1)) {
    if (esRelleno(linea)) {
      continue;
    }
    if (sangria(linea) <= base) {
      break;
    }
    hijos.push(linea);
  }
  return hijos;
}

/**
 * Las líneas que cuelgan de la clave `clave:` **de más a la izquierda** de
 * `lineas` (la de menor sangría): así `postgres:` dentro de un `depends_on` no
 * se confunde con el servicio `postgres`. `undefined` si no está.
 */
function hijosDeClave(
  lineas: readonly string[],
  clave: string,
): string[] | undefined {
  const utiles = lineas.filter((linea) => !esRelleno(linea));
  if (utiles.length === 0) {
    return undefined;
  }
  const izquierda = Math.min(...utiles.map(sangria));
  const indice = lineas.findIndex(
    (linea) => sangria(linea) === izquierda && linea.trim() === `${clave}:`,
  );
  return indice === -1 ? undefined : hijosDeLinea(lineas, indice);
}

function sinComillas(valor: string): string {
  const recortado = valor.trim();
  const comilla = recortado[0];
  if (
    recortado.length >= 2 &&
    (comilla === '"' || comilla === "'") &&
    recortado.endsWith(comilla)
  ) {
    return recortado.slice(1, -1);
  }
  return recortado;
}

/** `CLAVE: valor` por línea (un mapa de YAML plano). Lo que no cuadra, rompe. */
function mapaDeLineas(lineas: readonly string[], donde: string): Variables {
  const mapa: Variables = {};
  for (const linea of lineas) {
    const partes = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/.exec(linea);
    if (partes === null) {
      throw new Error(
        `${donde}: no sé leer esta línea del entorno (formato no soportado por el extractor): ${linea.trim()}`,
      );
    }
    mapa[partes[1] ?? ""] = sinComillas(partes[2] ?? "");
  }
  return mapa;
}

// --- Un extractor por lugar --------------------------------------------------

/** El `environment` de un servicio de `docker-compose.yml` (forma de mapa). */
function entornoDeServicioCompose(texto: string, servicio: string): Variables {
  const lineas = lineasDe(texto);
  const servicios = hijosDeClave(lineas, "services");
  const propios = servicios && hijosDeClave(servicios, servicio);
  if (propios === undefined) {
    throw new Error(
      `docker-compose.yml: no encuentro el servicio ${servicio}.`,
    );
  }
  const entorno = hijosDeClave(propios, "environment");
  if (entorno === undefined) {
    throw new Error(
      `docker-compose.yml: el servicio ${servicio} no tiene environment.`,
    );
  }
  return mapaDeLineas(entorno, `docker-compose.yml (${servicio})`);
}

interface PasoDeCi {
  readonly nombre: string;
  readonly variables: Variables;
}

/**
 * Los pasos de `.github/workflows/ci.yml` (job `ci`) que corren `npm run db:*`,
 * con su entorno: el `env` del job más el del paso (el del paso gana). Las
 * `services:` no cuentan: su `env` es el de Postgres, no el de la app.
 */
function pasosConBaseDeCi(texto: string): PasoDeCi[] {
  const lineas = lineasDe(texto);
  const job = hijosDeClave(hijosDeClave(lineas, "jobs") ?? [], "ci");
  const pasos = hijosDeClave(job ?? [], "steps");
  if (job === undefined || pasos === undefined) {
    throw new Error("ci.yml: no encuentro el job ci con sus steps.");
  }
  const delJob = mapaDeLineas(hijosDeClave(job, "env") ?? [], "ci.yml (job)");
  const izquierda = Math.min(...pasos.map(sangria));

  const grupos: string[][] = [];
  for (const linea of pasos) {
    if (sangria(linea) === izquierda && linea.trimStart().startsWith("- ")) {
      // El guion se vuelve espacio: así `name:` queda al nivel de `env:`.
      grupos.push([`${" ".repeat(izquierda)}  ${linea.trimStart().slice(2)}`]);
    } else {
      grupos[grupos.length - 1]?.push(linea);
    }
  }

  return grupos
    .filter((grupo) => grupo.some((linea) => /\bnpm run db:/.test(linea)))
    .map((grupo) => {
      const nombre = /^\s*name:\s*(.*?)\s*$/m.exec(grupo.join("\n"))?.[1];
      if (nombre === undefined) {
        throw new Error("ci.yml: un paso que corre db:* no tiene name.");
      }
      const delPaso = mapaDeLineas(
        hijosDeClave(grupo, "env") ?? [],
        `ci.yml (${nombre})`,
      );
      return {
        nombre: sinComillas(nombre),
        variables: { ...delJob, ...delPaso },
      };
    });
}

/** Los `const NOMBRE = "literal";` de un archivo: para resolver `${NOMBRE}`. */
function constantesDeCadena(texto: string): Variables {
  const constantes: Variables = {};
  for (const partes of texto.matchAll(
    /const\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"\n]*)"\s*;/g,
  )) {
    constantes[partes[1] ?? ""] = partes[2] ?? "";
  }
  return constantes;
}

type Elemento =
  | { readonly tipo: "cadena" | "plantilla"; readonly valor: string }
  | { readonly tipo: "otro"; readonly valor: string };

/**
 * Los elementos del arreglo que abre el `[` en `desde`: cada cadena y cada
 * plantilla (con su texto), y lo demás (`...COMANDO_WORKER`) como `otro`.
 * Salta los comentarios `//`, que pueden traer comillas. Devuelve también dónde
 * termina.
 */
function elementosDelArreglo(
  texto: string,
  desde: number,
): { elementos: Elemento[]; fin: number } {
  const elementos: Elemento[] = [];
  let profundidad = 0;
  let i = desde;
  while (i < texto.length) {
    const c = texto[i] ?? "";
    if (c === "[") {
      profundidad++;
      i++;
    } else if (c === "]") {
      profundidad--;
      i++;
      if (profundidad === 0) {
        return { elementos, fin: i };
      }
    } else if (c === '"' || c === "`") {
      let j = i + 1;
      while (j < texto.length && texto[j] !== c) {
        j += texto[j] === "\\" ? 2 : 1;
      }
      elementos.push({
        tipo: c === '"' ? "cadena" : "plantilla",
        valor: texto.slice(i + 1, j),
      });
      i = j + 1;
    } else if (c === "/" && texto[i + 1] === "/") {
      const salto = texto.indexOf("\n", i);
      i = salto === -1 ? texto.length : salto;
    } else if (/[A-Za-z_]/.test(c)) {
      const palabra = /^[A-Za-z_][A-Za-z0-9_]*/.exec(texto.slice(i))?.[0] ?? c;
      elementos.push({ tipo: "otro", valor: palabra });
      i += palabra.length;
    } else {
      i++;
    }
  }
  throw new Error("imagen.ts: un arreglo de docker run no cierra.");
}

interface DockerRun {
  readonly linea: number;
  readonly destino: "app" | "worker";
  readonly segundoPlano: boolean;
  readonly variables: Variables;
}

/**
 * Cada `docker run` (un arreglo que empieza con `"run"`) que lleva `--env`: los
 * que arrancan la app o el worker con un entorno escrito ahí. Los que no llevan
 * ninguno (`--entrypoint sh`, el de "sin APP_ENTORNO") no arrancan nada con
 * entorno propio. Es el worker si el arreglo trae `COMANDO_WORKER`.
 */
function dockerRunConEntorno(texto: string): DockerRun[] {
  const constantes = constantesDeCadena(texto);
  const corridas: DockerRun[] = [];
  for (const apertura of texto.matchAll(/\[\s*"run"\s*,/g)) {
    const { elementos } = elementosDelArreglo(texto, apertura.index);
    const variables: Variables = {};
    elementos.forEach((elemento, i) => {
      const siguiente = elementos[i + 1];
      if (
        elemento.tipo === "cadena" &&
        elemento.valor === "--env" &&
        siguiente !== undefined &&
        siguiente.tipo !== "otro"
      ) {
        const [nombre, ...resto] = siguiente.valor.split("=");
        variables[nombre ?? ""] = resolverConstantes(
          resto.join("="),
          constantes,
        );
      }
    });
    if (Object.keys(variables).length === 0) {
      continue;
    }
    corridas.push({
      linea: texto.slice(0, apertura.index).split("\n").length,
      destino: elementos.some(
        (e) => e.tipo === "otro" && e.valor === "COMANDO_WORKER",
      )
        ? "worker"
        : "app",
      segundoPlano: elementos.some(
        (e) => e.tipo === "cadena" && e.valor === "--detach",
      ),
      variables,
    });
  }
  return corridas;
}

/**
 * El objeto `const entorno = { ... };` de `scripts/e2e-app.ts`: lo que le pasa
 * a `db:migrate` y `db:seed`. El `...process.env` no cuenta: lo que se prueba
 * es lo que escribe el script.
 */
function entornoDeScript(texto: string): Variables {
  const partes = /const entorno = \{\n([\s\S]*?)\n\s*\};/.exec(texto);
  if (partes === null) {
    throw new Error("e2e-app.ts: no encuentro `const entorno = { ... };`.");
  }
  const variables: Variables = {};
  for (const linea of lineasDe(partes[1] ?? "")) {
    const recortada = linea.trim();
    if (
      recortada === "" ||
      recortada.startsWith("//") ||
      recortada.startsWith("...")
    ) {
      continue;
    }
    const campo = /^([A-Z][A-Z0-9_]*):\s*(["`])(.*)\2,?$/.exec(recortada);
    if (campo === null) {
      throw new Error(
        `e2e-app.ts: no sé leer esta línea del entorno (formato no soportado por el extractor): ${recortada}`,
      );
    }
    variables[campo[1] ?? ""] = campo[3] ?? "";
  }
  return variables;
}

/** Las líneas `NOMBRE=valor` de un `.env` (las de comentario no cuentan). */
function variablesDeDotenv(texto: string): Variables {
  const variables: Variables = {};
  for (const linea of lineasDe(texto)) {
    if (esRelleno(linea)) {
      continue;
    }
    const partes = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(linea.trim());
    if (partes === null) {
      throw new Error(
        `.env.example: no sé leer esta línea (formato no soportado por el extractor): ${linea.trim()}`,
      );
    }
    variables[partes[1] ?? ""] = sinComillas(partes[2] ?? "");
  }
  return variables;
}

// --- Valores: literales, constantes del archivo o ejemplo --------------------

/**
 * Reemplaza `${NOMBRE}` por la constante del mismo archivo y `${X:-por_defecto}`
 * por su valor por defecto (la forma de compose). Lo que no puede resolver lo
 * deja como estaba.
 */
function resolverConstantes(valor: string, constantes: Variables): string {
  return valor.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (texto, nombre: string, porDefecto: string | undefined) =>
      constantes[nombre] ?? porDefecto ?? texto,
  );
}

/**
 * El valor con que se prueba una variable: el literal del lugar; si quedó una
 * interpolación sin resolver o el valor está vacío, uno de ejemplo para esa
 * variable. Sin ejemplo, falla pidiéndolo (un `NOMBRE=` de una variable nueva
 * hay que sumarlo a `EJEMPLOS`).
 */
function valorDePrueba(nombre: string, valor: string): string {
  if (valor !== "" && !valor.includes("${")) {
    return valor;
  }
  const ejemplo = EJEMPLOS[nombre];
  if (ejemplo === undefined) {
    throw new Error(
      `${nombre}: el lugar no da un valor literal (vacío o interpolado) y este test no tiene un ejemplo válido para ella: sumala a EJEMPLOS.`,
    );
  }
  return ejemplo;
}

function conValoresDePrueba(variables: Variables): Variables {
  return Object.fromEntries(
    Object.entries(variables).map(([nombre, valor]) => [
      nombre,
      valorDePrueba(nombre, valor),
    ]),
  );
}

/** Las variables que `validarEntorno` rechaza, con la línea de su mensaje. */
function problemasDeEntorno(
  variables: Variables,
): { variable: string; linea: string }[] {
  const resultado = validarEntorno(variables, "el lugar");
  if (resultado.ok) {
    return [];
  }
  return resultado.mensaje
    .split("\n")
    .filter((linea) => linea.startsWith("- "))
    .map((linea) => ({
      variable: /^- ([A-Za-z0-9_.]+):/.exec(linea)?.[1] ?? linea,
      linea: linea.slice(2),
    }));
}

// --- Los lugares del repo ----------------------------------------------------

const RAIZ = path.resolve(import.meta.dirname, "../..");

function leer(relativa: string): string {
  return readFileSync(path.join(RAIZ, relativa), "utf8");
}

function lugaresDelRepo(): Lugar[] {
  const lugares: Lugar[] = [];

  const compose = leer("docker-compose.yml");
  for (const servicio of ["app", "worker"]) {
    lugares.push({
      clave: `compose:${servicio}`,
      nombre: `docker-compose.yml · servicio ${servicio} (environment)`,
      variables: entornoDeServicioCompose(compose, servicio),
    });
  }

  for (const paso of pasosConBaseDeCi(leer(".github/workflows/ci.yml"))) {
    lugares.push({
      clave: `ci:${paso.nombre}`,
      nombre: `.github/workflows/ci.yml · paso "${paso.nombre}" (env)`,
      variables: paso.variables,
    });
  }

  for (const corrida of dockerRunConEntorno(leer("scripts/imagen.ts"))) {
    const plano = corrida.segundoPlano ? "segundo plano" : "primer plano";
    lugares.push({
      clave: `imagen:${corrida.destino}:${corrida.segundoPlano ? "segundo" : "primer"}-plano`,
      nombre: `scripts/imagen.ts:${corrida.linea} · docker run del ${corrida.destino} (${plano})`,
      variables: corrida.variables,
    });
  }

  lugares.push({
    clave: "e2e-app",
    nombre:
      "scripts/e2e-app.ts · entorno con que migra y siembra (const entorno)",
    variables: entornoDeScript(leer("scripts/e2e-app.ts")),
  });

  lugares.push({
    clave: "env-example",
    nombre: ".env.example",
    variables: variablesDeDotenv(leer(".env.example")),
  });

  return lugares;
}

const LUGARES = lugaresDelRepo();

describe("M-04: el entorno completo en cada lugar que arranca un proceso", () => {
  it("encuentra todos los lugares que tiene que controlar (no pasa en vacío)", () => {
    expect(LUGARES.map((lugar) => lugar.clave)).toEqual(
      expect.arrayContaining([
        "compose:app",
        "compose:worker",
        "ci:Migrar (para el paso de drift)",
        "imagen:app:segundo-plano",
        "imagen:worker:primer-plano",
        "imagen:worker:segundo-plano",
        "e2e-app",
        "env-example",
      ]),
    );
    for (const lugar of LUGARES) {
      expect(
        Object.keys(lugar.variables).length,
        `${lugar.nombre}: el extractor no leyó ninguna variable`,
      ).toBeGreaterThan(0);
    }
  });

  for (const lugar of LUGARES) {
    const excepcion = EXCEPCIONES.find((e) => e.clave === lugar.clave);

    it(`${lugar.nombre}${excepcion ? ` (falta solo ${excepcion.variableAusente}, a propósito)` : ""}`, () => {
      const problemas = problemasDeEntorno(conValoresDePrueba(lugar.variables));
      if (excepcion === undefined) {
        expect(
          problemas.map((p) => `${lugar.nombre}: ${p.linea}`),
          `${lugar.nombre}: validarEntorno no acepta lo que este lugar pasa`,
        ).toEqual([]);
        return;
      }
      expect(
        Object.keys(lugar.variables),
        `${lugar.nombre}: la excepción dice que no pasa ${excepcion.variableAusente}, pero está`,
      ).not.toContain(excepcion.variableAusente);
      expect(
        problemas.map((p) => p.variable),
        `${lugar.nombre}: tiene que faltar solo ${excepcion.variableAusente} (${excepcion.motivo})`,
      ).toEqual([excepcion.variableAusente]);
    });
  }

  it("cada excepción corresponde a un lugar que existe (no quedan excepciones viejas)", () => {
    for (const excepcion of EXCEPCIONES) {
      expect(
        LUGARES.some((lugar) => lugar.clave === excepcion.clave),
        `la excepción ${excepcion.clave} no corresponde a ningún lugar`,
      ).toBe(true);
    }
  });
});

// --- Cada extractor, sobre un texto de ejemplo --------------------------------

describe("extractor de docker-compose.yml", () => {
  const EJEMPLO = `# comentario
name: ejemplo

services:
  db:
    image: postgres:1
    environment:
      USUARIO: uno
  web:
    profiles: ["x"]
    environment:
      # comentario adentro
      A: valor-a
      B: "con comillas"

      C: \${EXTERNA:-por-defecto}
    depends_on:
      db:
        condition: service_healthy
  otro:
    environment:
      Z: zeta
`;

  it("lee el environment del servicio pedido y no el de los vecinos", () => {
    expect(entornoDeServicioCompose(EJEMPLO, "web")).toEqual({
      A: "valor-a",
      B: "con comillas",
      C: `\${EXTERNA:-por-defecto}`,
    });
    expect(entornoDeServicioCompose(EJEMPLO, "otro")).toEqual({ Z: "zeta" });
  });

  it("no confunde un servicio con una clave de depends_on del mismo nombre", () => {
    expect(entornoDeServicioCompose(EJEMPLO, "db")).toEqual({ USUARIO: "uno" });
  });

  it("falla si el servicio no existe o no tiene environment", () => {
    expect(() => entornoDeServicioCompose(EJEMPLO, "nada")).toThrow(/nada/);
    const sin = "services:\n  solo:\n    image: x\n";
    expect(() => entornoDeServicioCompose(sin, "solo")).toThrow(/environment/);
  });

  it("falla con un formato que no sabe leer (environment como lista)", () => {
    const lista = "services:\n  web:\n    environment:\n      - A=1\n";
    expect(() => entornoDeServicioCompose(lista, "web")).toThrow(/formato/);
  });
});

describe("extractor de pasos db:* de ci.yml", () => {
  const EJEMPLO = `name: ci
jobs:
  ci:
    runs-on: ubuntu
    env:
      GLOBAL: "1"
    services:
      postgres:
        env:
          POSTGRES_USER: nadie
    steps:
      - name: Código
        uses: acciones/algo@abc

      # un comentario que dice npm run db:migrate no cuenta
      - name: Migrar uno
        if: \${{ !cancelled() }}
        env:
          A: valor-a
          GLOBAL: pisado
        run: npm run db:migrate

      - name: Sembrar
        run: |
          echo hola
          npm run db:seed

      - name: Otro
        env:
          B: b
        run: npm test
`;

  it("devuelve solo los pasos que corren npm run db:*, con el env del job y el del paso", () => {
    expect(pasosConBaseDeCi(EJEMPLO)).toEqual([
      { nombre: "Migrar uno", variables: { GLOBAL: "pisado", A: "valor-a" } },
      { nombre: "Sembrar", variables: { GLOBAL: "1" } },
    ]);
  });

  it("no toma el env de las services como entorno de un paso", () => {
    const todos = pasosConBaseDeCi(EJEMPLO).flatMap((paso) =>
      Object.keys(paso.variables),
    );
    expect(todos).not.toContain("POSTGRES_USER");
  });

  it("falla si no hay job ci", () => {
    expect(() => pasosConBaseDeCi("jobs:\n  otro:\n    steps: []\n")).toThrow(
      /job ci/,
    );
  });
});

describe("extractor de docker run de imagen.ts", () => {
  const EJEMPLO = `const BASE = "postgresql://x:y@h:1/d";
const EMAIL = "a@b.test";
const COMANDO_WORKER = ["node", "w.ts"] as const;

function a() {
  docker([
    "run",
    "--detach",
    "--env",
    "UNO=1",
    "--env",
    \`DOS=\${BASE}\`,
    // un comentario con "comillas" y [corchetes]
    "--env",
    "TRES=tres=con=iguales",
    etiqueta,
  ]);
  const b = spawnSync(
    "docker",
    ["run", "--name", X, "--env", "UNO=1", etiqueta, ...COMANDO_WORKER],
    { encoding: "utf8" },
  );
  docker(["run", "--rm", "--entrypoint", "sh", etiqueta, "-c", "ls"]);
  spawnSync("docker", ["run", "--name", X, etiqueta]);
  spawnSync("docker", ["rm", "--force", X]);
}
`;

  it("lee los docker run con --env: entorno, destino y plano", () => {
    expect(dockerRunConEntorno(EJEMPLO)).toEqual([
      {
        linea: 6,
        destino: "app",
        segundoPlano: true,
        variables: {
          UNO: "1",
          DOS: "postgresql://x:y@h:1/d",
          TRES: "tres=con=iguales",
        },
      },
      {
        linea: 20,
        destino: "worker",
        segundoPlano: false,
        variables: { UNO: "1" },
      },
    ]);
  });

  it("ignora los docker run sin --env y los que no son run", () => {
    expect(dockerRunConEntorno(EJEMPLO)).toHaveLength(2);
  });

  it("lee las constantes de cadena y deja de lado lo que no es una cadena", () => {
    expect(constantesDeCadena(EJEMPLO)).toEqual({
      BASE: "postgresql://x:y@h:1/d",
      EMAIL: "a@b.test",
    });
  });
});

describe("extractor del entorno de e2e-app.ts", () => {
  const EJEMPLO = `function prepararBase(puerto: string): void {
  const entorno = {
    ...process.env,
    // un comentario
    A: "uno",
    B: \`dos:\${puerto}/base\`,
  };
  for (const s of [1]) {}
}
`;

  it("lee las claves del objeto y salta el spread y los comentarios", () => {
    expect(entornoDeScript(EJEMPLO)).toEqual({
      A: "uno",
      B: `dos:\${puerto}/base`,
    });
  });

  it("falla si no encuentra el objeto o si una línea es de otra forma", () => {
    expect(() => entornoDeScript("const otra = {};")).toThrow(/entorno/);
    expect(() =>
      entornoDeScript("const entorno = {\n    A: unaFuncion(),\n  };"),
    ).toThrow(/formato/);
  });
});

describe("extractor de .env.example", () => {
  it("lee NOMBRE=valor, incluidos los vacíos, y salta comentarios", () => {
    const texto = "# comentario\nA=uno\n\nB=\nC=http://h:1/p\n# D=otro\n";
    expect(variablesDeDotenv(texto)).toEqual({
      A: "uno",
      B: "",
      C: "http://h:1/p",
    });
  });

  it("falla con una línea que no es NOMBRE=valor", () => {
    expect(() => variablesDeDotenv("esto no es una variable\n")).toThrow(
      /formato/,
    );
  });
});

describe("valores de prueba", () => {
  it("usa el literal; y el ejemplo si está vacío o quedó interpolado", () => {
    expect(valorDePrueba("IDENTIDAD", "falsa")).toBe("falsa");
    expect(valorDePrueba("IDENTIDAD", "")).toBe(EJEMPLOS.IDENTIDAD);
    expect(valorDePrueba("DATABASE_URL", `x:\${puerto}/y`)).toBe(
      EJEMPLOS.DATABASE_URL,
    );
    expect(valorDePrueba("DATABASE_URL", `\${{ secrets.BASE }}`)).toBe(
      EJEMPLOS.DATABASE_URL,
    );
  });

  it("pide un ejemplo si la variable no lo tiene", () => {
    expect(() => valorDePrueba("NO_EXISTE_ESTA", "")).toThrow(/EJEMPLOS/);
  });

  it(`resuelve \${CONSTANTE} y \${X:-por_defecto}, y deja lo demás`, () => {
    expect(resolverConstantes(`a-\${K}-\${X:-def}-\${Y}`, { K: "kk" })).toBe(
      `a-kk-def-\${Y}`,
    );
  });
});

describe("el control mismo", () => {
  /** Lo que pasa `.env.example`, que el test de arriba exige completo: así esto no se rompe al sumar una variable. */
  const COMPLETO = conValoresDePrueba(variablesDeDotenv(leer(".env.example")));

  it("nombra la variable que falta", () => {
    const sin = Object.fromEntries(
      Object.entries(COMPLETO).filter(([nombre]) => nombre !== "IDENTIDAD"),
    );
    expect(problemasDeEntorno(sin).map((p) => p.variable)).toContain(
      "IDENTIDAD",
    );
  });
});
