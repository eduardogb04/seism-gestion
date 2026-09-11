# AGENTS.md — instrucciones para agentes

> Puerta de entrada de cualquier agente (Claude Code, Codex, otro) y de cualquier persona que
> clone este repo. Si algo de acá contradice otro documento del repo, manda esto; si esto calla,
> manda el ADR correspondiente en `docs/adr/`; si nada dice, se pregunta antes de hacer.
>
> *Escrito en F0-01. Cada tarea de Fase 0 la amplía en su mismo PR.*

## Qué es este repo

Sistema de gestión de operaciones para una consultora chica de servicios a la minería: registra
servicios, ejecuciones, vencimientos, documentos e ingresos y egresos, y avisa antes de que las
cosas pasen. Monolito modular en TypeScript de punta a punta: Next.js, PostgreSQL, Prisma, con un
worker aparte para ingestas y tareas programadas. Lo construyen agentes; una persona con criterio
de negocio verifica los cortes.

**Este repositorio es público.** Ver *Reglas no negociables*, la primera.

**Estado (F0-05):** TypeScript severo, Biome como formato y lint, dependency-cruiser con los
límites de arquitectura, Next.js mínimo (una página, el latido `GET /api/salud` y el entorno
validado con Zod al arrancar) y CI en GitHub Actions: el check `ci` corre todos los controles y
gitleaks en cada push y cada PR (ver *CI*). Postgres/Prisma (F0-08) todavía no existe
(`db:migrate` sigue fallando a propósito — ver *Comandos*).

## Leer primero

1. Este archivo, entero.
2. `README.md` — cómo se levanta.
3. `docs/arquitectura.md` — capas, carpetas y qué puede importar cada una.
4. `docs/adr/` — las decisiones y por qué. No se reabren sin un ADR nuevo.
5. La spec de la tarea que te toca (`docs/specs/` o la que te pasaron).
6. `RUNBOOK.md` solo si tu tarea toca infraestructura o deja un paso manual.

## Comandos

Solo los que existen hoy. La tabla crece en cada tarea que suma una herramienta real.

| Comando | Qué hace hoy |
|---|---|
| `npm run dev` | `next dev`: la app en `http://localhost:3000`. Necesita `.env` (copiá `.env.example`); si falta una variable o es inválida, **no arranca** (sale 1 y dice cuál). Ver *Next.js y entorno* |
| `npm run build` | `next build` con `output: "standalone"`: compila, corre `tsc` y deja `.next/standalone/server.js`. **No necesita `.env`**; sí git o `APP_VERSION` (la versión del latido) |
| `node .next/standalone/server.js` | El servidor de producción, después de `npm run build` (no es un script de `package.json`). Toma las variables del entorno del proceso (`APP_ENTORNO=local node .next/standalone/server.js`) o del `.env` que el build copió si existía al compilar; `PORT` cambia el puerto |
| `npm run lint` | `biome check .` — Biome en modo verificación (lint + formato) sobre `src/`, `tests/` (menos `tests/fixtures/`), `scripts/` y los archivos de config de la raíz. `-- --write` aplica los arreglos |
| `npm test` | Vitest sobre `tests/dominio/` (hoy: el test de humo, el esquema de entorno y la resolución de la versión) |
| `npm run typecheck` | `tsc --noEmit` (TypeScript severo, `.ts` y `.tsx`) y después `scripts/sin-any.ts`, que rechaza cualquier `any` explícito (TypeScript no tiene opción de compilador para eso — ver ADR 0002; saltea lo que genera Next, ADR 0005) |
| `npm run typecheck:fixtures` | Prueba negativa de lo anterior: corre el mismo chequeo sobre `tests/fixtures/typecheck/*.ts`, que **tienen** que ser rechazados. Sale 0 si los rechazó a todos, 1 si aceptó alguno |
| `npm run lint:fixtures` | Prueba negativa de `lint`: corre Biome sobre `tests/fixtures/lint/debe-fallar.ts`, que **tiene** que ser rechazado por `noExplicitAny` **y** `noUnusedVariables`. Sale 0 si Biome lo rechazó con las dos reglas, 1 si lo aceptó o si falta alguna |
| `npm run limites` | dependency-cruiser (`.dependency-cruiser.cjs`) sobre `src/`, `tests/` y `scripts/`: los límites entre capas, `no-circular` y `no-orphans`, todos en `error`. Ver *Límites de arquitectura* |
| `npm run limites:fixtures` | Prueba negativa de `limites`: corre dependency-cruiser sobre cada carpeta de `tests/fixtures/limites/` (una por regla), por separado. Sale 0 si cada una fue rechazada por **su** regla y desde los archivos esperados; 1 si alguna pasó, la rechazó otra regla, o hay una regla sin fixture |
| `npm run db:migrate` | **Sale 1** con mensaje claro: no hay esquema ni Prisma hasta F0-08 |

Antes de abrir un PR: `npm run typecheck && npm run lint && npm run limites && npm test && npm run
typecheck:fixtures && npm run lint:fixtures && npm run limites:fixtures && npm run build`. Es lo
mismo que corre CI (menos gitleaks); correrlo antes ahorra una vuelta.

## CI

`.github/workflows/ci.yml`, un solo job llamado **`ci`**: es el nombre del check que la protección
de `main` exige en verde (F0-06). Decisiones y porqués en el ADR 0006.

- **Cuándo corre.** En cada `push` (cualquier rama o tag) y en cada `pull_request`. Una rama con PR
  abierto corre dos veces por commit (en la página del PR, `ci / ci (push)` y
  `ci / ci (pull_request)`; en `gh pr checks`, dos filas `ci`); tienen que estar verdes las dos.
- **Qué corre.** `npm ci` (nunca `npm install`) y después, en orden: `typecheck`,
  `typecheck:fixtures`, `lint`, `lint:fixtures`, `limites`, `limites:fixtures`, `test`, `build`
  (sin `.env`) y gitleaks sobre los commits nuevos (los del PR; en un push, los que trajo). Si
  `npm ci` anduvo, **corren todos aunque falle uno**, así el log muestra todos los rojos juntos; el
  check queda en rojo si falla cualquiera.
- **Tope: 10 minutos** (P9, `timeout-minutes`). Hoy tarda menos de un minuto. Si pasa de 10, el
  check queda en rojo y es un bug de CI.
- **Cómo leer el resultado.** `gh pr checks <N>` lista los checks del PR con su estado y el link a
  la corrida (`gh pr checks <N> --watch` espera a que terminen). Si hay rojo:
  `gh run view <id-de-corrida> --log-failed` muestra solo los pasos que fallaron; el nombre del
  paso es el del comando (`test`, `limites:fixtures`...) y se reproduce local con
  `npm run <paso>`. Sin PR: `gh run list --branch <rama>`.
- **gitleaks en rojo.** El log dice regla, archivo, línea y commit, con el valor `REDACTED` (los
  logs de un repo público son públicos). Si es un secreto real: **no alcanza con borrarlo en otro
  commit** — ya está en el historial de la rama; se para, se avisa a Eduardo y se rota en el
  servicio que lo emitió (`RUNBOOK.md` tiene reservada la sección *Si un secreto entró al repo*,
  todavía sin escribir). Si es un falso positivo: `.gitleaksignore` con el *fingerprint* del log y el
  motivo en el PR; nunca se saca el paso.
- **Reglas del workflow.** Permisos base `contents: read`; un job que necesite más los eleva en su
  propio bloque (el de la imagen, F0-07). Ningún paso con `continue-on-error`. Toda acción de
  terceros, incluidas las de `actions/*`, **fijada por SHA de commit completo** con el tag en un
  comentario (`uses: actions/checkout@<sha> # v7.0.1`), verificado con
  `gh api repos/<dueño>/<acción>/commits/<tag>`; nunca por tag. Dependabot propone las subidas de
  las acciones; gitleaks (versión y SHA-256 del binario en `ci.yml`) se sube a mano, con el
  procedimiento del ADR 0006. Biome no lee YAML: `ci.yml` no lo lintea nada, se revisa en el PR.

## Next.js y entorno

Next.js 16 (App Router) en `src/app/`. **Esta versión cambió mucho respecto de lo que conocen los
modelos:** antes de escribir código de Next, leé la guía que corresponda en
`node_modules/next/dist/docs/` (viene con el paquete y coincide con la versión instalada).
`next.config.ts` tiene `agentRules: false` para que `next dev` no escriba su propio bloque en este
archivo (ADR 0005).

- **Levantar en local.** Copiá `.env.example` a `.env` (`.env` está en `.gitignore`: nunca entra
  al repo) y `npm run dev`. Next lee `.env` solo.
- **`.env` y `standalone`.** Si al compilar existe un `.env`, `next build` lo **copia** a
  `.next/standalone/.env` y `server.js` lo lee. Sin `.env` al compilar, las variables van en el
  entorno del proceso. Para la imagen Docker (F0-07): el `.env` no puede entrar al contexto del
  build (`.dockerignore`), o la imagen se lleva los valores adentro.
- **El entorno se valida al arrancar**, no al compilar: `src/instrumentation.ts` (lo levanta Next
  una vez, antes de atender pedidos) llama a `exigirEntornoValido` de
  `src/infraestructura/entorno.ts`. Si una variable falta o es inválida, escribe en stderr cuál
  (sin repetir el valor) y el proceso sale con código 1, en `next dev` y en `server.js`. `npm
  run build` no valida el entorno ni necesita `.env`.
- **La versión del latido** (`GET /api/salud` → `{ ok: true, version }`) se fija al compilar:
  `next.config.ts` usa `APP_VERSION` si está definida (la pasa el build de Docker desde F0-07) o,
  si no, el SHA corto de git; sin ninguna, el build falla. Next reemplaza
  `process.env.APP_VERSION` por el literal en el código compilado.
- **Archivos de Next.** `page.tsx`, `layout.tsx` y `route.ts` los carga Next por su nombre, y
  `src/instrumentation.ts` tiene que vivir en la raíz de `src/` pero cuenta como parte de `app`
  para los límites. El layout raíz es el mínimo que exige el App Router (`<html lang="es">`), sin
  estilos.
- **`tsconfig.json` y Next.** Next exige `jsx: "react-jsx"` y agrega el plugin `next`, los tipos
  que genera (`next-env.d.ts`, `.next/types/`) e `incremental`. Las seis opciones severas no se
  tocan; si una tipificación de Next choca, se documenta la excepción puntual en un ADR, no se
  relaja el `tsconfig`. `next-env.d.ts` y `*.tsbuildinfo` están en `.gitignore`. Detalle en el
  ADR 0005.
- **Imports.** Relativos y con extensión (`../../infraestructura/entorno.ts`), como en el resto
  del repo; no hay alias `@/*`. Desde `next.config.ts`, los módulos de `next` van con extensión
  (`next/constants.js`): el paquete no tiene mapa `exports`.

## Formato y lint

Biome (`biome.json`, raíz del repo) hace las dos cosas en una sola herramienta: formato y lint.
`npm run lint` corre `biome check .`, que es **verificación**, no escribe nada; agregando
`-- --write` aplica formato y los arreglos seguros de lint.

- **Alcance.** `src/` (`.ts` y `.tsx`), `tests/` (menos `tests/fixtures/`, que un lint normal no
  puede tocar — es donde viven los fixtures que **tienen** que fallar), `scripts/` y los archivos
  de config de la raíz (`*.ts` —`next.config.ts` incluido—, `*.json` menos `package-lock.json`, y
  `.dependency-cruiser.cjs`). Lo que genera Next (`.next/` y `next-env.d.ts`) queda afuera: su
  formato no es el de Biome.
- **Reglas en `error`, ninguna en `warn`.** Biome trae reglas de `recommended` con severidad mixta
  (`warn` en varias, `error` en otras) — un lint que solo emite `warn` no hace fallar `biome
  check` y no cumple el criterio. `biome.json` fija en `"error"`, rule por rule, las que
  `recommended` deja en `warn` o `info`, más las cinco que pide el criterio de F0-02
  (`noExplicitAny`, `noUnusedVariables`, `noUnusedImports`, `noNonNullAssertion`, `useConst`).
  `a11y` y `security` ya vienen en `error` en `recommended`, sin overrides. Ver ADR 0003 (por qué
  no alcanza con `--error-on-warnings`, y qué revisar si Dependabot sube la versión de Biome).
- **Prueba de que rechaza.** `tests/fixtures/lint/debe-fallar.ts` tiene un `any` explícito y una
  variable sin usar (dos reglas independientes, para que el rechazo de una no tape que la otra
  dejó de andar). Como el lint normal excluye `tests/fixtures/`, esa carpeta tiene su propio
  `biome.json` (`"root": true`, no hereda nada de la raíz) solo con esas dos reglas. `npm run
  lint:fixtures` (`scripts/lint-fixtures.ts`) invoca el binario de Biome con `cwd` en esa carpeta,
  imprime su salida de error, e **invierte** el código de salida: sale 0 si Biome rechazó el
  fixture y aparecen los diagnósticos de las dos reglas, 1 si lo aceptó o si falta alguno de los
  dos.
- **`// biome-ignore` exige motivo.** Ninguno sin explicar por qué en el mismo comentario. Si
  Biome choca con código real, se arregla el código, no la regla.

## Límites de arquitectura

dependency-cruiser (`.dependency-cruiser.cjs`, reglas comentadas en castellano) hace cumplir qué
carpeta de `src/` puede importar a cuál. La tabla completa, con el porqué de cada fila, está en
`docs/arquitectura.md`. En corto:

| Carpeta | Solo puede importar | Regla |
|---|---|---|
| `src/dominio` | `src/dominio`. Nada de paquetes npm ni `node:*`, aunque no estén instalados | `dominio-puro` |
| `src/casos-uso` | `dominio` y `puertos`. Nunca `adaptadores`, `app`, `worker`, `infraestructura`, `@prisma/*` | `casos-uso-sin-afuera` |
| `src/puertos` | `dominio` (y otros puertos). Nada de paquetes npm ni `node:*` | `puertos-solo-dominio` |
| `src/adaptadores` | `dominio`, `puertos`, `infraestructura`, paquetes. Nunca `casos-uso`, `app`, `worker` | `adaptadores-sin-casos-uso-ni-entradas` |
| `src/app` (con `src/instrumentation.ts`), `src/worker` | `casos-uso`, `puertos`, `infraestructura`. Adaptadores **solo** a través de `src/infraestructura/arranque/`; dominio **solo** con `import type` | `adaptadores-solo-en-arranque` · `app-worker-dominio-solo-tipos` |
| `src/infraestructura` | Lo que necesite, pero adaptadores **solo** desde `arranque/` (el punto de armado) | `adaptadores-solo-en-arranque` |

Más `no-circular` (ningún ciclo, tampoco solo de tipos) y `no-orphans` (ningún módulo suelto en
`src/`; `tests/`, `scripts/` y los archivos que Next carga por su nombre son puntos de entrada y
quedan exceptuados). Todas en `error`, sobre `.ts` y `.tsx`. El punto de armado y el "dominio
solo por tipos" están decididos en el ADR 0004; lo de Next, en el ADR 0005.

- **`import type`, no `import { type X }`.** Para leer tipos del dominio desde `app` o `worker` se
  usa `import type { X }`. La forma inline `import { type X }` dependency-cruiser la deja pasar,
  pero TypeScript la deja en el JavaScript; la frena Biome (`useImportType`). Ver ADR 0004.
- **Prueba de que rechaza.** `tests/fixtures/limites/` tiene **una carpeta por regla**, con el
  nombre de la regla. Cada una replica la estructura `src/...` que hace falta para que la regla le
  aplique, y trae archivos que la violan y archivos que no (el caso permitido). `npm run
  limites:fixtures` (`scripts/limites-fixtures.ts`) corre dependency-cruiser sobre cada carpeta
  por separado, con `cwd` en ella y la configuración de la raíz, imprime la salida e **invierte**
  el código: 0 si cada fixture fue rechazado por su regla y exactamente desde los archivos
  declarados en el script; 1 si alguno pasó, lo rechazó otra regla, un archivo permitido aparece
  como violación, o una regla no tiene fixture (o una carpeta no tiene regla).
- **dependency-cruiser y TypeScript.** dependency-cruiser 18.2.0 parsea TypeScript `>=2 <7`. Es
  otro motivo para no aceptar un bump de TypeScript a 7.x sin decidirlo aparte (ADR 0002 y 0004).

## Reglas no negociables

Las hace cumplir la máquina donde se puede; donde no, la revisión.

1. **Nada real en el repo.** Ni datos de la empresa, de clientes, de personas, ni montos, ni
   documentos de negocio, ni secretos, ni `.env`. Las semillas y los tests usan datos
   **ficticios**. El repo es público: lo que entra queda indexado en minutos. Si dudás, no entra.
2. **El dominio no importa infraestructura.** `src/dominio` solo importa de `src/dominio`, y
   cada capa respeta sus límites (sección *Límites de arquitectura*). Lo hace cumplir `npm run
   limites` (dependency-cruiser).
3. **El reloj se inyecta.** Cero llamadas a la fecha del sistema en el dominio. Biome lo va a
   hacer cumplir desde F0-18/F0-19 (dominio todavía no existe).
4. **Nada de `any`.** `tsc --noEmit` (TypeScript severo) frena el implícito; `scripts/sin-any.ts`
   frena el explícito — es lo que corre `npm run typecheck` (ver ADR 0002). Biome (`noExplicitAny`,
   `npm run lint`) es la segunda red.
5. **Todo borde externo se valida con Zod**, incluidas las variables de entorno al arrancar: si
   falta una, la app no arranca (`src/infraestructura/entorno.ts`, ver *Next.js y entorno*).
6. **Todo error tiene código estable** del catálogo (`DOM-0001`). No existe `throw new Error`.
   (El catálogo llega en el lote 6.)
7. **Ningún log con secretos ni datos personales.** Hay un test dedicado. (Llega en F0-24.)
8. **La IA nunca escribe en el dominio.** Crea borradores o propone; un humano confirma.
9. **Un archivo que crece demasiado se parte.**
10. **Todo cambio de esquema es una migración con su `down.sql`.** Nadie toca la base a mano.
    (Aplica desde F0-08.)
11. **Todo paso manual va a `RUNBOOK.md`** en el mismo PR. Ninguna tarea cierra con uno sin
    documentar.
12. **Un cambio de arquitectura sin ADR no pasa revisión.**
13. **Todo entra por PR. CI en rojo = no se fusiona y no arranca ninguna tarea nueva.** "CI" es el
    check `ci` de GitHub Actions (sección *CI*): en rojo en un PR, ese PR no se fusiona; en rojo en
    `main`, lo primero es arreglarlo, antes de cualquier tarea nueva. Se mira con `gh pr checks
    <N>` o, para `main`, `gh run list --branch main`.
14. **Sin `TODO`, sin código muerto.** Lo que no se hace ahora, no se deja anotado en el código:
    se escribe como tarea.
15. **No hay configuración atada a ningún editor ni a ningún CLI de agente**, con una única
    excepción documentada: `CLAUDE.md` (ver ADR 0001). Ningún otro archivo de ese tipo entra al
    repo.

## Cómo se trabaja

```
spec  →  test que falla  →  implementación  →  verde  →  tester verifica criterios  →  merge
```

- **TDD en el dominio**: la regla se escribe como test antes que el código.
- **Una tarea = una rama = un PR.** Rama `f0-NN-titulo-corto`. Título del PR `F0-NN · Título`.
- **El PR describe cómo se verifica cada criterio de aceptación**, qué NO entró, qué paso manual
  quedó en RUNBOOK y qué ADR se escribió.
- **El que implementa no se aprueba.** Un tester distinto verifica los criterios.
- **Tamaño**: una tarea entra en una sesión y su diff se revisa de una sentada. Si no, se parte
  antes de empezar.

## Formato de una tarea (spec)

Contexto · Criterios de aceptación (observables y verificables) · Qué NO entra · Qué toca ·
Cómo se prueba · Riesgos.

## Definición de terminado

- [ ] Criterios de aceptación escritos antes de empezar, todos verdes
- [ ] Tests en el nivel que corresponde (dominio · casos de uso · e2e · extracción)
- [ ] CI entera en verde: el check `ci` del PR (typecheck, lint, límites, tests, fixtures, build,
      gitleaks; migraciones desde F0-11), visto con `gh pr checks <N>`
- [ ] Si tocó el esquema: migración con `down.sql` y el test que aplica y revierte
- [ ] Si cambió la arquitectura: ADR
- [ ] Si dejó un paso manual: `RUNBOOK.md`
- [ ] Si agregó un modo de fallar: error en el catálogo
- [ ] Sin `TODO`, sin código muerto, sin `any`
- [ ] El diff se revisa de una sentada
- [ ] Nada real en el diff (regla 1)

## Cómo se agrega...

*(Cada tarea de Fase 0 completa su sección acá.)*

**...un comando que todavía no tiene herramienta (F0-01).** Un script dedicado que sale 1 con un
mensaje claro en castellano que dice qué tarea lo trae (como `scripts/db-migrate-pendiente.ts`
para `db:migrate`). Se reemplaza por la herramienta real en la tarea que corresponda, sin dejar
rastro del placeholder. (El placeholder genérico que salía 0, `scripts/pendiente.ts`, se borró en
F0-04 al quedar sin uso.)

**...una variable de entorno (F0-04).** En la misma tarea: al esquema de
`src/infraestructura/entorno.ts` (con el tipo más estrecho posible: `z.enum`, `z.url()`...), su
caso en `tests/dominio/entorno.test.ts` (ausente, inválida, válida), y a `.env.example`: **sin
valor si es secreta** (`NOMBRE=`), con su único valor válido en local si no lo es (como
`APP_ENTORNO=local`). Si hace falta en el servidor o en CI, el paso manual va a `RUNBOOK.md`.

**...un fixture que una herramienta tiene que rechazar (F0-01).** Un archivo bajo
`tests/fixtures/<herramienta>/` que viola **una sola** regla, por lo demás válido. El script
`<herramienta>:fixtures` corre el chequeo real sobre el fixture e **invierte** el código de
salida: sale 0 si la herramienta lo rechazó (mostrando su salida de error, para que se vea que
rechaza a propósito), 1 si lo aceptó. `tests/fixtures/` está excluido del chequeo normal.
Excepción (F0-02, decisión del orquestador): `lint/debe-fallar.ts` viola **dos** reglas a
propósito (`noExplicitAny` y `noUnusedVariables`) y el script verifica que **las dos** aparezcan
en la salida, para que el rechazo de una no tape que la otra dejó de andar.
En `limites/` (F0-03) el fixture es una **carpeta** por regla, no un archivo: puede tener varios
archivos que violan esa regla (y solo esa) y archivos que representan el caso permitido; el
script verifica la regla y la lista exacta de archivos que la violan.

**...un límite de arquitectura nuevo o cambiado (F0-03).** Un ADR que diga qué cambia y por qué;
la regla en `.dependency-cruiser.cjs`, en `error` y comentada en castellano; su carpeta en
`tests/fixtures/limites/<nombre-de-la-regla>/` y su entrada en `scripts/limites-fixtures.ts`
(el script falla si una regla no tiene fixture); y la tabla de `docs/arquitectura.md` y la de
este archivo.

**...un punto de entrada que nadie importa (F0-03).** `no-orphans` rechaza cualquier módulo de
`src/` que no importa nada y que nadie importa. Si es un punto de entrada legítimo (un archivo que
levanta un framework o un proceso, no código muerto), se agrega su ruta al `pathNot` de
`no-orphans` en `.dependency-cruiser.cjs`, con un comentario que diga quién lo levanta. Hoy están
exceptuados `tests/` (Vitest), `scripts/` (`node` desde `package.json`) y los archivos de Next que
carga el framework (F0-04): `page`, `layout` y `route` (`.ts`/`.tsx`) en cualquier carpeta de
`src/app/`, y `src/instrumentation.ts`. Si una tarea usa otro archivo especial de Next
(`loading.tsx`, `error.tsx`, `not-found.tsx`...), lo suma a esa excepción y al fixture
`tests/fixtures/limites/no-orphans/`.

**...un control a CI (F0-05).** El comando va primero a `package.json` (se tiene que poder correr
local con `npm run <nombre>`) y después como paso del job `ci` en `.github/workflows/ci.yml`, con
`name` igual al script y la misma condición que los demás
(`if: ${{ !cancelled() && steps.dependencias.outcome == 'success' }}`), sin `continue-on-error`.
Si el control es un `*:fixtures`, va al lado de su control. Si necesita una acción de terceros, va
fijada por SHA con el tag en comentario. La corrida tiene que seguir entrando en 10 minutos; se
suma a la lista de *Antes de abrir un PR* y a la sección *CI*.

**...un ADR.** Archivo nuevo `docs/adr/NNNN-titulo-corto.md`, con la misma estructura que
`docs/adr/0001-excepcion-claude-md.md` y `docs/adr/0002-any-explicito-en-typecheck.md`: Contexto ·
Decisión · Alternativas descartadas · Consecuencias · Cómo se revierte. Numeración correlativa,
nunca se reutiliza, aunque el plan haya sugerido otro número para una tarea futura (el plan es una
estimación; el orden real de creación manda).

## Estructura

```
src/dominio          puro; solo importa de sí mismo (vacío hasta el lote 5)
src/casos-uso        orquesta dominio contra puertos (vacío hasta el lote 5)
src/puertos          interfaces (vacío hasta el lote 5)
src/adaptadores      implementaciones: prisma, disco, s3, identidad, dobles (vacío hasta F0-08)
src/infraestructura  entorno.ts (Zod) · version.ts · log (F0-24) · arranque/ = punto de armado
src/app              Next.js (App Router): página de inicio, layout raíz, api/salud
src/instrumentation.ts  lo levanta Next al arrancar: valida el entorno. Cuenta como app
src/worker           proceso aparte: planificador + jobs (vacío hasta el lote 6)
tests/               dominio · casos-uso · extraccion · e2e · contratos · fixtures
scripts/             utilidades de los comandos de package.json (sin-any.ts, etc.)
next.config.ts       configuración de Next: standalone, versión del build, agentRules
docs/                arquitectura.md (capas y límites) · adr/
.github/             workflows/ci.yml (el check `ci`) · CODEOWNERS · dependabot.yml
```

Cada carpeta de `src/` y `tests/` tiene su propio `README.md` explicando qué va a vivir ahí y
desde qué tarea.

## Nunca

- Commitear secretos, `.env`, datos reales, documentos de negocio.
- Push directo a `main`.
- Cambiar stack, arquitectura o dependencias sin ADR aprobado.
- Marcar algo como terminado sin evidencia del tester y CI en verde.
- Tocar el servidor a mano: todo por script y por workflow.
