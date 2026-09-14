/**
 * Límites de arquitectura (F0-03). Convierten "el dominio no importa
 * infraestructura" de acuerdo en mecanismo: `npm run limites` sale distinto
 * de 0 si alguna regla de acá se viola.
 *
 * Fuente: la sección 1 de DISENO (Arquitectura y modelo de dominio: capas y
 * módulos) y la tabla "Límites que dependency-cruiser hace cumplir" del plan
 * de Fase 0. La versión aterrizada en carpetas reales, con el porqué de cada
 * regla, está en `docs/arquitectura.md`; las decisiones del punto de armado
 * y de "dominio solo tipos" están en el ADR 0004.
 *
 * Las rutas de las reglas son relativas al directorio desde donde corre
 * dependency-cruiser: la raíz del repo en `npm run limites`, y la carpeta de
 * cada fixture en `npm run limites:fixtures` (cada fixture replica la
 * estructura `src/...` para que estas mismas reglas le apliquen).
 *
 * Todas en `error`: una regla en `warn` no hace fallar el comando.
 *
 * Next.js (F0-04, ADR 0005): `src/instrumentation.ts` es un archivo de Next
 * que tiene que vivir en la raíz de `src/` (no puede ir en `src/app/`), pero
 * es parte de la entrada `app`: las reglas de `app` le aplican igual. Se
 * analizan `.ts` y `.tsx` (las páginas de Next son `.tsx`).
 */

/** `src/instrumentation.ts`: lo levanta Next al arrancar; cuenta como `app`. */
const INSTRUMENTACION_NEXT = "^src/instrumentation\\.ts$";

/**
 * El cliente que genera `prisma generate` (F0-08, ADR 0008). Vive adentro de
 * `src/adaptadores/`, así que las reglas por capa ya lo cubren como a
 * cualquier adaptador; solo `no-circular` lo exceptúa.
 */
const CLIENTE_PRISMA_GENERADO = "^src/adaptadores/prisma/generado/";

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      // Fila `src/dominio` de la tabla (sección 1 de DISENO: "el dominio no
      // sabe quién lo llamó ni dónde se guarda lo que produce").
      // El dominio solo importa del dominio: ni otras carpetas de `src/`, ni
      // paquetes npm (`@prisma/*`, `next`, `zod`...), ni módulos de Node
      // (`node:*` o sin prefijo). Se escribe como "cualquier destino que no
      // sea `src/dominio/`" para que atrape también lo que no se puede
      // resolver: un paquete que todavía no está instalado (`@prisma/client`
      // antes de F0-08) aparece con su nombre tal cual, y ese nombre tampoco
      // empieza con `src/dominio/`.
      name: "dominio-puro",
      comment:
        "src/dominio solo puede importar de src/dominio: ni paquetes npm, ni módulos de Node, ni otras capas (sección 1 de DISENO; docs/arquitectura.md).",
      severity: "error",
      from: { path: "^src/dominio/" },
      to: { pathNot: "^src/dominio/" },
    },
    {
      // Fila `src/casos-uso`: orquesta dominio contra puertos. No conoce
      // implementaciones (`adaptadores`, `@prisma/*`), ni la infraestructura,
      // ni quién lo llama (`app`, `worker`). `worker` no figura en la columna
      // "No puede" de la tabla, pero tampoco en "Puede importar", y comparte
      // fila con `app`: es un punto de entrada, igual que `app`.
      name: "casos-uso-sin-afuera",
      comment:
        "src/casos-uso no puede importar adaptadores, app, worker, infraestructura ni @prisma/* (sección 1 de DISENO; docs/arquitectura.md).",
      severity: "error",
      from: { path: "^src/casos-uso/" },
      to: {
        path: [
          "^src/(adaptadores|app|worker|infraestructura)/",
          "(^|/)node_modules/@prisma/",
          "^@prisma/",
        ],
      },
    },
    {
      // Fila `src/puertos`: interfaces que el núcleo le pide al afuera. Solo
      // pueden nombrar tipos del dominio; "todo lo demás" prohibido, igual
      // que en el dominio (paquetes npm y módulos de Node incluidos).
      name: "puertos-solo-dominio",
      comment:
        "src/puertos solo puede importar de src/puertos y src/dominio (sección 1 de DISENO; docs/arquitectura.md).",
      severity: "error",
      from: { path: "^src/puertos/" },
      to: { pathNot: "^src/(puertos|dominio)/" },
    },
    {
      // Fila `src/adaptadores`: implementan puertos con tecnología concreta
      // y pueden usar dominio, puertos e infraestructura. No conocen a quién
      // los usa: ni `casos-uso` ni los puntos de entrada (`app` y, por la
      // misma razón que en la regla de casos-uso, `worker`).
      name: "adaptadores-sin-casos-uso-ni-entradas",
      comment:
        "src/adaptadores no puede importar casos-uso, app ni worker (sección 1 de DISENO; docs/arquitectura.md).",
      severity: "error",
      from: { path: "^src/adaptadores/" },
      to: { path: "^src/(casos-uso|app|worker)/" },
    },
    {
      // Fila `src/app` y `src/worker`, primera mitad: "adaptadores solo en el
      // punto de armado". El punto de armado es `src/infraestructura/arranque/`
      // (ADR 0004): es el único lugar fuera de `src/adaptadores` que puede
      // importar un adaptador. `app` y `worker` los reciben a través de él, y
      // el resto de `infraestructura` (entorno, log) tampoco los importa.
      // Dominio, casos-uso y puertos ya lo tienen prohibido por sus reglas.
      // `src/instrumentation.ts` es parte de `app` (ADR 0005).
      name: "adaptadores-solo-en-arranque",
      comment:
        "Solo src/infraestructura/arranque puede importar src/adaptadores; app (con src/instrumentation.ts), worker y el resto de infraestructura pasan por él (ADR 0004 y 0005; docs/arquitectura.md).",
      severity: "error",
      from: {
        path: ["^src/(app|worker|infraestructura)/", INSTRUMENTACION_NEXT],
        pathNot: "^src/infraestructura/arranque/",
      },
      to: { path: "^src/adaptadores/" },
    },
    {
      // Fila `src/app` y `src/worker`, segunda mitad: "dominio directo para
      // escribir no, leer tipos sí". Se permiten solo las dependencias de
      // solo tipos, que la compilación borra y dependency-cruiser distingue
      // gracias a `tsPreCompilationDeps` (ver `options`):
      // - `type-only`: `import type { X } from` y `export type { X } from`.
      // - `type-import`: `import("...").X` en posición de tipo.
      // Cualquier otro import del dominio (uno de valor, o uno mixto que
      // trae un tipo y un valor) es violación: para ejecutar reglas del
      // dominio se pasa por un caso de uso (ADR 0004).
      // Hueco conocido: `import { type X } from` (modificador inline, sin
      // valores) dependency-cruiser lo marca `type-only`, pero TypeScript
      // con `verbatimModuleSyntax` deja el import en el JavaScript. Lo cierra
      // Biome: `useImportType` (en `error`) exige `import type` en ese caso.
      // `src/instrumentation.ts` es parte de `app` (ADR 0005).
      name: "app-worker-dominio-solo-tipos",
      comment:
        "src/app (con src/instrumentation.ts) y src/worker solo pueden importar tipos de src/dominio (`import type`); para escribir se pasa por casos-uso (ADR 0004 y 0005; docs/arquitectura.md).",
      severity: "error",
      from: { path: ["^src/(app|worker)/", INSTRUMENTACION_NEXT] },
      to: {
        path: "^src/dominio/",
        dependencyTypesNot: ["type-only", "type-import"],
      },
    },
    {
      // Criterio de F0-03: sin ciclos, en ningún lado. Un ciclo entre
      // módulos es la forma más común de que dos capas terminen siendo una.
      // Con `tsPreCompilationDeps` también cuenta un ciclo que existe solo
      // por tipos: es acoplamiento igual (ADR 0004).
      // Excepción (F0-08, ADR 0008): el cliente que genera Prisma en
      // `src/adaptadores/prisma/generado/` trae ciclos internos entre sus
      // propios archivos. No es código nuestro ni se edita: se exceptúan solo
      // los ciclos que **empiezan** en él. Un ciclo que pase por un archivo
      // nuestro se sigue informando desde ese archivo. Las reglas por capa
      // no se tocan: importar el cliente desde `casos-uso`, `dominio` o
      // `puertos` sigue siendo violación (fixture en `casos-uso-sin-afuera`).
      name: "no-circular",
      comment:
        "Ningún ciclo de dependencias entre módulos (F0-03; docs/arquitectura.md).",
      severity: "error",
      from: { pathNot: CLIENTE_PRISMA_GENERADO },
      to: { circular: true },
    },
    {
      // Criterio de F0-03: nada suelto. Un módulo que no importa nada y que
      // nadie importa es código muerto o un punto de entrada.
      // Excepciones (puntos de entrada legítimos, no código muerto):
      // - `tests/`: cada test lo levanta Vitest, nadie lo importa.
      // - `scripts/`: cada script lo levanta `node` desde package.json.
      // - Los archivos de Next.js que carga el framework por su nombre, sin
      //   que nadie los importe (F0-04, ADR 0005): `page`, `layout` y `route`
      //   en cualquier carpeta de `src/app/`, y `src/instrumentation.ts`. Si
      //   se usa otro archivo especial de Next (`loading`, `error`,
      //   `not-found`...), se suma acá en la tarea que lo trae. Un `.tsx`
      //   suelto con otro nombre sigue siendo huérfano.
      // Los archivos de configuración de la raíz (`vitest.config.ts`,
      // `next.config.ts`, este mismo archivo) nunca entran al análisis:
      // `npm run limites` solo mira `src/`, `tests/` y `scripts/`. Los
      // `README.md` de cada carpeta
      // tampoco: dependency-cruiser solo lee JavaScript y TypeScript, así que
      // no hace falta excluirlos acá. `tests/fixtures/` queda fuera de todo
      // (ver `options.exclude`).
      name: "no-orphans",
      comment: "Ningún módulo huérfano en src/ (F0-03; docs/arquitectura.md).",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "^tests/",
          "^scripts/",
          // Dos expresiones en vez de `(.+/)?`: dependency-cruiser rechaza
          // las expresiones con cuantificadores anidados ("unsafe regex").
          "^src/app/(page|layout|route)\\.tsx?$",
          "^src/app/.+/(page|layout|route)\\.tsx?$",
          INSTRUMENTACION_NEXT,
        ],
      },
      to: {},
    },
  ],
  options: {
    // `tests/fixtures/` son archivos que TIENEN que violar reglas: fuera del
    // chequeo normal. Los prueba `npm run limites:fixtures`, uno por uno.
    exclude: { path: "^tests/fixtures/" },
    // Los paquetes npm se registran como destino (para que las reglas los
    // vean) pero no se recorren por dentro.
    doNotFollow: { path: "(^|/)node_modules/" },
    // Analiza el TypeScript antes de compilar: así ve los `import type`
    // (que la compilación borra) y los marca como `type-only`. Lo necesitan
    // `app-worker-dominio-solo-tipos` (para distinguirlos) y `dominio-puro`
    // (un `import type` de `@prisma/client` en el dominio también es
    // violación).
    tsPreCompilationDeps: true,
  },
};
