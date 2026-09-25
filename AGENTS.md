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

**Estado (F0-10 + F0-06 + F0-11 + F0-12):** TypeScript severo, Biome como formato y lint,
dependency-cruiser con los límites de arquitectura, Next.js mínimo (una página, el latido
`GET /api/salud` y el entorno validado con Zod al arrancar), CI en GitHub Actions (el check `ci`
corre todos los controles y gitleaks en cada push y cada PR — ver *CI*), imagen Docker (se
construye y se prueba en cada corrida, y se publica en `ghcr.io/eduardogb04/seism-gestion` en cada
push a `main` — ver *Imagen Docker*), la base: Postgres 16 local en `docker-compose.yml`, Prisma 7
con la tabla `configuracion` y su primera migración (con `down.sql`), `npm run db:migrate` y
`npm run db:migrate:down`, el test que aplica y revierte la cadena entera contra un Postgres de
Testcontainers, el mecanismo de semilla (`npm run db:seed`, con el cliente de Prisma armado con
`@prisma/adapter-pg`), y el control de drift en CI: un paso propio del check `ci` pone rojo un
cambio en `schema.prisma` sin su migración — ver *Base de datos* — y `main` protegida con un
ruleset de GitHub (PR obligatorio, `ci` en verde, sin push directo — ver *Rama principal
protegida*). La app todavía no se conecta a la base. Y está escrito el script que levanta el
servidor del ensayo (`infra/oracle/bootstrap.sh`), que todavía no corrió contra ninguna instancia
— ver *El servidor del ensayo (Oracle)*.

## Leer primero

Este archivo entero y todo `docs/adr/` es demasiado para leer en cada tarea (M-01). En vez de eso:

1. La spec de la tarea que te toca (`docs/specs/` o la que te pasaron) — siempre.
2. De este archivo, solo las secciones que la tabla de abajo dice para lo que tu tarea toca.
3. Un ADR de `docs/adr/` — solo cuando una sección de la tabla o la spec lo cita puntualmente. No
   se reabren sin un ADR nuevo.
4. `RUNBOOK.md` solo si tu tarea toca infraestructura o deja un paso manual.

**Si tu tarea toca… → leé estas secciones.**

| Si tu tarea toca… | Leé estas secciones |
|---|---|
| Llegás sin spec ni contexto | *Qué es este repo* · `README.md` · `docs/arquitectura.md` · *Cómo se trabaja* · *Formato de una tarea (spec)* · *Definición de terminado* · *Comandos* |
| Cualquier tarea, sin excepción | *Reglas no negociables* · *Nunca* · *Definición de terminado* |
| Entender qué es este repo antes de arrancar | *Qué es este repo* |
| Un comando de `npm run ...`, `package.json` o `scripts/` | *Comandos* |
| `.github/workflows/ci.yml`, un check del PR o gitleaks | *CI* |
| `main`, ramas, el ruleset de GitHub | *Rama principal protegida* |
| Next.js, variables de entorno, `src/app`, `src/instrumentation.ts` | *Next.js y entorno* |
| `Dockerfile`, `.dockerignore`, `scripts/imagen.ts` | *Imagen Docker* |
| `infra/`, el servidor del ensayo, Oracle | *El servidor del ensayo (Oracle)* |
| `prisma/`, `schema.prisma`, una migración, `docker-compose.yml` (Postgres) | *Base de datos* |
| `Identificador<Marca>`, `CodigoLegible` | *Identificadores* |
| Un test nuevo, o dónde va | *Testing: en qué nivel va cada cosa* |
| El dominio (`src/dominio/`), sus tests o el umbral de mutación | *Testing: en qué nivel va cada cosa*, *Mutation testing* |
| `biome.json`, una regla de lint o de formato | *Formato y lint* |
| `.dependency-cruiser.cjs`, qué carpeta puede importar a cuál | *Límites de arquitectura* |
| El flujo de trabajo: ramas, PR, quién aprueba | *Cómo se trabaja* |
| Escribir o leer la spec de una tarea | *Formato de una tarea (spec)* |
| Cerrar una tarea (el checklist final) | *Definición de terminado* |
| Agregar un comando, migración, fixture, límite, paso de CI, algo a la imagen o un ADR nuevos | *Cómo se agrega...* |
| Dónde va un archivo nuevo, la estructura de carpetas | *Estructura* |
| Qué no se hace nunca en este repo | *Nunca* |

## Comandos

Solo los que existen hoy. La tabla crece en cada tarea que suma una herramienta real.

| Comando | Qué hace hoy |
|---|---|
| `npm install` / `npm ci` | Instala y, en `postinstall`, corre `prisma generate`: escribe el cliente de Prisma en `src/adaptadores/prisma/generado/` (no se versiona). No necesita base ni `.env`. Ver *Base de datos* |
| `docker compose up -d --wait` | Levanta el Postgres 16 local (`docker-compose.yml`) y espera a que esté sano. `docker compose ps` → `(healthy)`; `docker compose down` lo apaga (`-v` borra el volumen). Necesita Docker corriendo |
| `npm run dev` | `next dev`: la app en `http://localhost:3000`. Necesita `.env` (copiá `.env.example`); si falta una variable o es inválida, **no arranca** (sale 1 y dice cuál). Ver *Next.js y entorno* |
| `npm run build` | `next build` con `output: "standalone"`: compila, corre `tsc` y deja `.next/standalone/server.js`. **No necesita `.env`**; sí git o `APP_VERSION` (la versión del latido) |
| `node .next/standalone/server.js` | El servidor de producción, después de `npm run build` (no es un script de `package.json`). Toma las variables del entorno del proceso (`APP_ENTORNO=local node .next/standalone/server.js`) o del `.env` que el build copió si existía al compilar; `PORT` cambia el puerto |
| `npm run lint` | `biome check .` — Biome en modo verificación (lint + formato) sobre `src/`, `tests/` (menos `tests/fixtures/`), `scripts/` y los archivos de config de la raíz. `-- --write` aplica los arreglos |
| `npm test` | Vitest sobre los niveles `dominio` y `casos-uso` (ver *Testing: en qué nivel va cada cosa*): el ciclo de siempre. **Necesita Docker corriendo** (el nivel casos de uso levanta un Postgres); no necesita `.env` ni la base de compose |
| `npm run test:dominio` | Solo el nivel `dominio`, con su reloj: `scripts/test-dominio.ts` mide la corrida entera y **sale 1 si tarda más de 10 s** (criterio de F0-14). No necesita nada: el nivel dominio no abre red ni base |
| `npm run test:extraccion` | Solo el nivel `extraccion` (golden files): el arnés `compararConGolden` (F0-16) y su caso de ejemplo |
| `npm run test:golden:update` | Regenera **a propósito** los goldens de `tests/extraccion/golden/` (`ACTUALIZAR_GOLDEN=si`) y lo avisa en pantalla. CI nunca lo corre; revisá el diff a mano antes de commitear (F0-16) |
| `npm run test:e2e` | Playwright (Chromium) sobre `tests/e2e/`: levanta la app con compose —la imagen que se publica— y recorre el camino de humo. Necesita Docker corriendo y el navegador instalado una vez (`npx playwright install chromium`, RUNBOOK sección 16). `-- --ui` abre la interfaz de Playwright; `-- --headed`, el navegador a la vista |
| `npm run test:todo` | Los cuatro niveles: `vitest run` (dominio, casos de uso, extracción) y después el e2e |
| `npm run test:mutacion` | Mutation testing (F0-17): `stryker run` muta `src/dominio/**` y corre el nivel `dominio` (`stryker.vitest.config.ts`, no `vitest.config.ts`: no necesita Docker) por cada mutante. No es parte del ciclo de un PR (tarda más y no lo exige el check `ci`): corre a mano o los lunes en `.github/workflows/mutacion.yml`. Ver *Mutation testing* y ADR 0017 |
| `npm run e2e:app` | No se llama a mano: es el `webServer` de `playwright.config.ts`. Construye la imagen (`npm run imagen`), levanta el servicio `app` del perfil `e2e` de compose y espera el latido. Lo apaga `tests/e2e/_arnes/apagar-app.ts` al terminar el e2e |
| `npm run typecheck` | `tsc --noEmit` (TypeScript severo, `.ts` y `.tsx`) y después `scripts/sin-any.ts`, que rechaza cualquier `any` explícito (TypeScript no tiene opción de compilador para eso — ver ADR 0002; saltea lo que generan Next, ADR 0005, y Prisma, ADR 0008) |
| `npm run typecheck:fixtures` | Prueba negativa de lo anterior: corre el mismo chequeo sobre `tests/fixtures/typecheck/*.ts`, que **tienen** que ser rechazados. Sale 0 si los rechazó a todos, 1 si aceptó alguno |
| `npm run lint:fixtures` | Prueba negativa de `lint`: corre Biome sobre cada fixture de `tests/fixtures/lint/`, por separado. `debe-fallar.ts` **tiene** que ser rechazado por `noExplicitAny` **y** `noUnusedVariables`; `reloj-inyectado/` por la regla del reloj (`noRestrictedGlobals` sobre `Date`), y solo desde `src/dominio/`. Sale 0 si cada uno fue rechazado por sus reglas y el caso permitido quedó limpio; 1 si alguno pasó, falta un diagnóstico o sobra uno |
| `npm run limites` | dependency-cruiser (`.dependency-cruiser.cjs`) sobre `src/`, `tests/` y `scripts/`: los límites entre capas, `no-circular` y `no-orphans`, todos en `error`. Ver *Límites de arquitectura* |
| `npm run limites:fixtures` | Prueba negativa de `limites`: corre dependency-cruiser sobre cada carpeta de `tests/fixtures/limites/` (una por regla), por separado. Sale 0 si cada una fue rechazada por **su** regla y desde los archivos esperados; 1 si alguna pasó, la rechazó otra regla, o hay una regla sin fixture |
| `npm run verificar` | `scripts/verificar.ts` (M-01): corre `typecheck`, `lint`, `limites`, `test` y los `*:fixtures` que haya en `package.json`, en ese orden, una línea `✔`/`✘ <paso> (<segundos> s)` por paso; si uno falla, muestra sus últimas 60 líneas y para (sale ≠ 0). La salida completa de cada paso queda en `.verificar/<paso>.log`. `-- --seguir` corre todos igual y suma cuántos fallaron. Usalo durante el desarrollo en vez de los cuatro comandos sueltos |
| `npm run imagen` | Construye la imagen Docker: `docker build` multi-stage con `--build-arg APP_VERSION` (el SHA corto de git, o `APP_VERSION` si está definida). Sin etiqueta, `seism-gestion:local`; `-- <etiqueta>...` construye con las que le pases (es lo que hace CI al publicar). Necesita Docker corriendo, no necesita `npm ci` |
| `npm run imagen:prueba` | Levanta esa imagen, espera el `HEALTHCHECK`, pide `/` y `/api/salud`, compara la versión con la del build, verifica que no lleve `.env` ni variables de más y que entre en el tope de tamaño. Informa **todas** las verificaciones que fallaron. `-- <etiqueta>` para probar otra |
| `npm run db:migrate` | `scripts/db-migrate.ts`: lee `.env` si existe, **valida el entorno** (el mismo esquema que la app) y recién entonces corre `prisma migrate deploy`, que aplica las migraciones pendientes de `prisma/migrations/` (desde una base vacía o una ya migrada). Si `DATABASE_URL` falta o no es `postgresql://`/`postgres://`, **sale 1** nombrando la variable y Prisma ni se ejecuta. Necesita la base levantada |
| `npm run db:migrate:down` | `scripts/db-migrate-down.ts`: valida el entorno igual que `db:migrate` y revierte **la última migración aplicada** en la base local de compose: su `down.sql` y el borrado de su fila de `_prisma_migrations`, en una transacción (así `db:migrate` la vuelve a aplicar). Una por corrida. Sale 1 si `DATABASE_URL` no apunta a `localhost` (no ejecuta nada), si no hay migraciones aplicadas o si la reversión falla. Necesita el servicio `postgres` de compose levantado. Ver ADR 0009 |
| `npm run db:generar` | `prisma generate`: regenera el cliente en `src/adaptadores/prisma/generado/` después de cambiar `prisma/schema.prisma`. No se conecta a ninguna base |
| `npm run db:seed` | `scripts/db-seed.ts`: valida el entorno igual que `db:migrate` y corre `prisma/seed.ts` (idempotente) con el cliente real de Prisma (`src/adaptadores/prisma/cliente.ts`, con `@prisma/adapter-pg`). Sale 1 sin sembrar nada si `APP_ENTORNO=servidor` y falta `SEED_PERMITIDO=si`. Necesita la base levantada |

Antes de abrir un PR: `npm run typecheck && npm run lint && npm run limites && npm run test:dominio
&& npm test && npm run test:extraccion && npm run typecheck:fixtures && npm run lint:fixtures &&
npm run limites:fixtures && npm run build`. Es lo mismo que corre CI (menos gitleaks, la imagen y
el e2e); correrlo antes ahorra una vuelta. `npm test` necesita Docker corriendo (nivel casos de
uso). Si tocaste el `Dockerfile`, el `.dockerignore`, `scripts/imagen.ts` o algo que se vea en la
app, sumá `npm run imagen && npm run imagen:prueba && npm run test:e2e` (hace falta Docker
corriendo y el navegador de Playwright instalado; si no los tenés, lo corre CI igual).

## CI

`.github/workflows/ci.yml`, un solo job llamado **`ci`**: es el nombre del check que la protección
de `main` exige en verde (F0-06). Decisiones y porqués en el ADR 0006.

- **Cuándo corre.** En cada `push` (cualquier rama o tag) y en cada `pull_request`. Una rama con PR
  abierto corre dos veces por commit (en la página del PR, `ci / ci (push)` y
  `ci / ci (pull_request)`; en `gh pr checks`, dos filas `ci`); tienen que estar verdes las dos.
- **Qué corre.** `npm ci` (nunca `npm install`) y después, en orden: `typecheck`,
  `typecheck:fixtures`, `lint`, `lint:fixtures`, `limites`, `limites:fixtures`, **`test:dominio`**
  (F0-14: el nivel dominio solo, con el tope de 10 s), `test` (dominio y casos de uso;
  Testcontainers usa el Docker que trae el runner, sin pasos extra), **`test:extraccion`**,
  **`Migrar (para el paso de drift)`** y **`drift`** (F0-11: aplica las migraciones contra el
  `services: postgres` del job y compara el resultado con `schema.prisma` — ver *Base de datos*),
  `build` (sin `.env`), `imagen` e `imagen:prueba` (F0-07: construye la imagen Docker y la verifica
  levantada), **el navegador del e2e y `test:e2e`** (F0-14: Chromium cacheado entre corridas, y el
  camino de humo contra la app levantada con compose) y gitleaks sobre los commits nuevos (los del
  PR; en un push, los que trajo). Si
  `npm ci` anduvo, **corren todos aunque falle uno**, así el log muestra todos los rojos juntos; el
  check queda en rojo si falla cualquiera. Los de la imagen y el de gitleaks solo dependen del
  checkout: corren aunque `npm ci` falle.
- **`drift` en rojo.** El mensaje `hay un cambio en \`schema.prisma\` sin migración` quiere decir
  que alguien cambió el esquema y no creó la migración (`docs/convenciones-base.md`, sección *El
  ciclo de una migración*). Si el mensaje es otro (`prisma migrate diff falló...`), la herramienta
  no llegó a comparar — mirar el log de arriba de ese mismo paso.
- **Hay un segundo job, `publicar`** (F0-07): publica la imagen en GHCR y **solo corre en `push` a
  `main`**, con `needs: ci`. En un PR ni aparece; el check que se mira sigue siendo `ci`, que cubre
  todo lo que corre en un PR.
- **Tope: 10 minutos** (P9, `timeout-minutes` en cada job). Hoy la corrida entera tarda poco más de
  un minuto, la mitad de eso el build de la imagen. Si pasa de 10, el check queda en rojo y es un bug de CI.
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
  propio bloque (hoy solo `publicar`, con `packages: write`). Ningún paso con `continue-on-error`. Toda acción de
  terceros, incluidas las de `actions/*`, **fijada por SHA de commit completo** con el tag en un
  comentario (`uses: actions/checkout@<sha> # v7.0.1`), verificado con
  `gh api repos/<dueño>/<acción>/commits/<tag>`; nunca por tag. Dependabot propone las subidas de
  las acciones; gitleaks (versión y SHA-256 del binario en `ci.yml`) se sube a mano, con el
  procedimiento del ADR 0006. Biome no lee YAML: `ci.yml` no lo lintea nada, se revisa en el PR.

## Rama principal protegida

Desde F0-06, `main` tiene un *ruleset* de GitHub (D1: repo público → protección de rama gratis).
**Todo cambio entra por PR. Ninguna tarea nueva arranca con CI en rojo en `main`.** El ruleset
exige PR (0 aprobaciones, con resolución de conversaciones obligatoria) y el check `ci` en verde
(*strict*: la rama tiene que estar al día con `main`), y prohíbe push directo, force-push y borrar
la rama. Sin *bypass* para nadie, ni para el dueño del repo: si hay que saltarlo en una emergencia,
se desactiva a mano y queda en el registro de GitHub (`RUNBOOK.md`, sección *Proteger la rama
principal*, dice cómo).

## Next.js y entorno

Next.js 16 (App Router) en `src/app/`. **Esta versión cambió mucho respecto de lo que conocen los
modelos:** antes de escribir código de Next, leé la guía que corresponda en
`node_modules/next/dist/docs/` (viene con el paquete y coincide con la versión instalada).
`next.config.ts` tiene `agentRules: false` para que `next dev` no escriba su propio bloque en este
archivo (ADR 0005).

- **Levantar en local.** Copiá `.env.example` a `.env` (`.env` está en `.gitignore`: nunca entra
  al repo) y `npm run dev`. Next lee `.env` solo. Las variables hoy: `APP_ENTORNO` y
  `DATABASE_URL` (F0-08; la de `.env.example` apunta al Postgres de `docker-compose.yml`). La app
  todavía no se conecta a la base, pero sin `DATABASE_URL` válida no arranca.
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

## Imagen Docker

`Dockerfile` y `.dockerignore` en la raíz; `scripts/imagen.ts` es el comando que la construye y la
prueba, el mismo en CI y en cualquier máquina (`npm run imagen`, `npm run imagen:prueba`).
Decisiones y porqués en el ADR 0007. En corto:

- **Multi-stage.** La etapa de build hace `npm ci` + `npm run build`; la final se lleva solo
  `.next/standalone` y `.next/static`, corre como el usuario `node` (no root) y trae un
  `HEALTHCHECK` que pide `/api/salud` con `fetch` (sin curl ni wget adentro). Base
  `node:24.14.1-alpine3.22` **fijada por digest**, como las acciones (ADR 0006); Dependabot
  (ecosistema `docker`) propone las subidas.
- **La misma imagen sirve para app y worker.** No hay `ENTRYPOINT` propio: `CMD` es
  `node server.js` (la app) y el worker (F0-25) va a correr esta misma imagen sobrescribiendo el
  comando. No se inventa nada de eso antes de que el worker exista.
- **La versión entra como `--build-arg APP_VERSION`** (el SHA corto). `.git` no está en el contexto,
  así que **sin ese argumento el build falla**, a propósito (ADR 0005). `/api/salud` devuelve
  exactamente esa versión y la prueba la compara.
- **El `.env` no entra al contexto**, primera línea del `.dockerignore`: si existiera al compilar,
  `next build` lo copiaría al `standalone` y la imagen —pública— se lo llevaría adentro. También
  quedan afuera `.git`, `.github`, `node_modules`, `.next`, `tests/` y `docs/`.
- **`npm run imagen:prueba` es el test de esta parte**, y corre en CI: `HEALTHCHECK` sano, `/` y
  `/api/salud` con la versión del build, ningún archivo `.env` adentro, ninguna variable fuera de
  la lista permitida, ninguna capa que mencione un `.env`, el contenedor **sale 1 sin
  `APP_ENTORNO` ni `DATABASE_URL`** (nombrando las dos), y el tamaño por debajo de **250 MB** (hoy
  206 MB). Falla nombrando **todas** las verificaciones que no pasaron. El contenedor de la prueba
  se levanta con `APP_ENTORNO=ci` y una `DATABASE_URL` ficticia (la app todavía no se conecta).
- **Prisma en la imagen (F0-08).** La etapa `dependencias` copia `prisma.config.ts` y
  `prisma/schema.prisma` antes de `npm ci`, porque `postinstall` genera el cliente; el cliente
  generado de la máquina no entra al contexto (`.dockerignore`).
- **Publicación:** solo en `push` a `main`, job `publicar`, etiquetas SHA y `latest` en
  `ghcr.io/eduardogb04/seism-gestion`, y retención de las últimas 5 versiones (P8). Solo
  `linux/amd64`; multi-arch es una línea comentada en el `Dockerfile`. Los pasos manuales de GitHub
  (hacer público el paquete, rol *Admin* del repositorio sobre él) están en el `RUNBOOK.md`,
  secciones 14 y 15.
- **Si tocás el `Dockerfile`**, el `.dockerignore` o el script: corré los dos comandos antes del PR
  (o dejá que lo haga el check `ci`, que los corre igual), y si cambia algo de lo de arriba,
  actualizá esta sección y el ADR.

## El servidor del ensayo (Oracle)

F0-12. El deploy de Fase 0 va a una instancia **Oracle Always Free** (AMD micro, 1 GB de RAM). Es
una **prueba de habitabilidad, no de carga**, y se rige por tres reglas del diseño:

- **Nada que no esté en git o en un respaldo externo vive ahí.** Oracle recupera las instancias con
  uso bajo sostenido; si un martes apaga la nuestra, se perdió una máquina, no información.
- **La máquina nunca compila.** Con 1 GB de RAM el build se queda sin memoria: CI construye la
  imagen y el servidor solo la corre.
- **El servidor no se toca a mano.** Todo lo que hay ahí lo puso `infra/oracle/bootstrap.sh`. Si
  hace falta algo nuevo en la instancia, se agrega **al script**, no por SSH.

`infra/oracle/bootstrap.sh` deja una instancia recién creada lista para correr contenedores:
sistema actualizado, 2 GB de swap, usuario `deploy` sin contraseña con `sudo` limitado a
`/usr/bin/docker`, SSH solo por clave `ed25519`, el puerto 80 abierto en el firewall local de la
imagen, journald con rotación, y Docker con su plugin `compose`. Corre **solo en Ubuntu** (en otra
imagen se niega a arrancar) y es **idempotente**: termina imprimiendo `Cambios aplicados: N`, y la
segunda corrida tiene que decir `0`. Decisiones y porqués: `docs/adr/0013-bootstrap-de-la-instancia-oracle.md`.
Paso a paso para una persona: `RUNBOOK.md`, sección 4.

Lo que hace falta saber si tu tarea toca el servidor:

- **Allá los comandos van con `sudo docker …`** (y `sudo docker compose …`): `deploy` no está en el
  grupo `docker`, a propósito (ADR 0013).
- **Ni una IP, usuario, clave ni dato real en el script:** parámetros y valores de ejemplo. El repo
  es público.
- **La lista de seguridad de la VCN no la toca el script** (es la consola de Oracle): abre 22 y 80
  **solo desde una IP**, y es un paso del RUNBOOK.
- **Nada de esto lo prueba CI:** no hay instancia contra la cual correrlo. Se prueba a mano y se
  registra en `docs/ensayos/`, con la plantilla `docs/ensayos/PLANTILLA-oracle-bootstrap.md`.
  **El ensayo todavía no se hizo:** la instancia no existe.

## Base de datos

Postgres + Prisma 7 (`prisma` y `@prisma/client` fijados en 7.10.0). **Antes de tocar el esquema,
leé `docs/convenciones-base.md`** (la regla, los nombres y el ciclo de una migración). Decisiones y
porqués en el ADR 0008. En corto:

- **Nadie toca la base a mano.** Todo cambio de esquema es una migración en
  `prisma/migrations/<marca>_<nombre>/` con **`migration.sql` y `down.sql`** (P1). El `down.sql` se
  genera con `prisma migrate diff` y se revisa a mano; revierte solo el esquema de su migración y no
  toca `_prisma_migrations` (el registro de Prisma, que no es tabla propia). Nunca `prisma db
  push`; nunca se edita una migración que ya está en `main`.
- **Local:** `docker compose up -d --wait` (Postgres 16, volumen `postgres-datos`, solo en
  `127.0.0.1:5432`) y `npm run db:migrate`. Las credenciales de `docker-compose.yml` y la
  `DATABASE_URL` de `.env.example` son **de desarrollo local, ficticias**; una URL real nunca entra
  al repo. RUNBOOK, sección 1.
- **Configuración:** `prisma.config.ts` (raíz) da las rutas y toma la URL de `DATABASE_URL` (carga
  `.env` si existe: Prisma 7 no lo lee solo). No valida, para que `prisma generate` corra sin base;
  la validación está en `npm run db:*`, que es por donde se corren los comandos de base.
- **El cliente generado** vive en `src/adaptadores/prisma/generado/`: lo escribe `postinstall` /
  `npm run db:generar`, **no se versiona y no se edita**. Nada escrito a mano va en esa carpeta.
  Como está dentro de `src/adaptadores/`, dependency-cruiser no deja importarlo desde `dominio`,
  `puertos` ni `casos-uso`, y `app`/`worker` solo llegan por `src/infraestructura/arranque/`. Tres
  excepciones por ruta, solo por ser generado: `sin-any.ts` lo saltea, Biome lo excluye y
  `no-circular` ignora los ciclos que empiezan en él. `tsc` lo incluye (trae `// @ts-nocheck`).
- **Reversión (F0-09, ADR 0009).** `npm run db:migrate:down` revierte la última migración aplicada
  en la base **local** (su `down.sql` y su fila de `_prisma_migrations`, en una transacción). Un
  `down.sql` no lleva `BEGIN`/`COMMIT`. La lógica está en `scripts/lib/migraciones.ts` y corre
  `psql` adentro del contenedor de Postgres: no hay driver de Postgres.
- **Test de migraciones** (`tests/casos-uso/migraciones.test.ts`, en `npm test` y en CI): corre
  contra el Postgres 16 efímero que el arnés del nivel casos de uso levanta una vez por corrida
  (Testcontainers, `@testcontainers/postgresql` 12.1.0, la misma imagen que `docker-compose.yml`),
  en una base recién creada y sin migrar (`crearBaseVacia`). Aplica toda la cadena de
  `prisma/migrations/`, exige `prisma migrate diff` vacío contra `schema.prisma`, revierte todos
  los `down.sql` en orden inverso y exige la base sin tablas propias. Recorre la carpeta: **una
  migración nueva entra sola**, y si su `down.sql` no revierte exacto o `schema.prisma` no
  coincide, `npm test` queda en rojo. No deja contenedores (datos en `tmpfs`, cierre del
  `globalSetup` y Ryuk).
- **El cliente con adaptador** (F0-10, `src/adaptadores/prisma/cliente.ts`): `crearClientePrisma`
  arma un `PrismaClient` con `@prisma/adapter-pg` (Prisma 7 no trae driver por defecto) y el driver
  `pg`, ambos fijados en versión exacta. Es el primer código que se conecta de verdad a Postgres
  con el cliente generado (hasta acá, `db:migrate` y `db:migrate:down` corrían la CLI de Prisma o
  `psql` por su cuenta).
- **La semilla** (F0-10, `prisma/seed.ts` + `scripts/db-seed.ts`, en `npm run db:seed`): inserta las
  claves de `configuracion` con sus valores por defecto (hoy, `ia.tope_mensual_usd` en `"0"`).
  Idempotente por clave: si el valor no cambió, no escribe nada, así correrla dos veces deja la
  base exactamente igual (`id`, `creado_en` y `actualizado_en` incluidos); un test de casos de uso
  la corre dos veces contra un Postgres de Testcontainers y compara. `prisma/seed.ts` importa solo
  de `adaptadores/prisma` (el tipo del cliente generado): la validación de entorno y el permiso
  para correr en el servidor viven en `scripts/db-seed.ts`, que se niega si `APP_ENTORNO=servidor`
  sin `SEED_PERMITIDO=si` (no es una variable del esquema de entorno; es un chequeo puntual de ese
  script, como el de "solo local" de `db-migrate-down.ts`). **Las semillas de Fase 1 serán
  ficticias**: clientes, sitios, personas y montos inventados que respeten la forma de los casos
  reales de la empresa, sin nombrar ninguno — el repo es público (P14, regla 1).
- **Control de drift en CI (F0-11, ADR 0011).** Dos pasos del check `ci`, contra un Postgres
  descartable propio del job (`services: postgres`, no el de Testcontainers de arriba): `Migrar
  (para el paso de drift)` aplica las migraciones existentes, y `drift` corre `prisma migrate diff
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code` contra esa base. Si no da
  vacío, el paso escribe `::error::hay un cambio en \`schema.prisma\` sin migración` y el check
  queda en rojo. Prisma 7.10 no tiene los flags que pedía el plan (`--from-migrations
  --to-schema-datamodel`, de Prisma 5/6); el equivalente que queda, `--from-migrations`, pide una
  shadow database nueva, así que se compara desde la base ya migrada. El otro caso del mismo
  criterio (`prisma/migrations/` con una carpeta sin `down.sql`) lo cubre
  `tests/casos-uso/migraciones-completas.test.ts`, sin Docker.

## Identificadores

`src/dominio/compartido/identificador.ts` (F0-19, DISENO sección 2 decisión 6): el identificador
doble de toda entidad — un UUID interno y un código legible tipo `SRV-2026-014` — es lo primero
que existe en `src/dominio` y `src/puertos`.

- **`Identificador<Marca>`** es un `string` marcado por tipo con una marca fantasma (`unique
  symbol`, no existe en runtime): dos identificadores con `Marca` distinta no se asignan entre sí,
  aunque el valor de los dos sea el mismo string en ejecución. `identificadorDesde<Marca>(valor)`
  le da esa forma a un UUID ya generado; no genera nada ni valida formato de UUID. Los prefijos
  concretos por entidad (`SRV`, `FAC`...) no existen todavía: los define Fase 1.
- **`CodigoLegible`** (`formatearCodigo`/`generarCodigoLegible`/`parsearCodigo`). `formatearCodigo`
  es pura: no llama a `Date` ni importa ningún puerto, y recibe `anio` como dato — la necesita
  `parsearCodigo` para reconstruir y reformatear un código ya existente, de un año que no es
  "ahora". `generarCodigoLegible` es la puerta de entrada para un código **nuevo**: recibe el
  `Reloj` inyectado (`compartido/reloj.ts`, F0-18) y toma el año de `reloj.ahora().anio` — nunca de
  `Date` ni de un parámetro numérico que el llamador haya resuelto por su cuenta — y delega en
  `formatearCodigo` para el resto. Formato `PREFIJO-AAAA-NNN`: prefijo de 3 letras mayúsculas, año
  de 4 dígitos (entre 1000 y 9999: `formatearCodigo` lo exige y `parsearCodigo` lo rechaza si no,
  aunque el texto tenga 4 dígitos — bug encontrado por la propiedad de mutación de un carácter al
  pasar a fast-check en F0-15, ver ADR 0015), secuencia rellenada a 3 dígitos que se ensancha a 4 o
  más al pasar de 999, sin techo y sin romper el parseo. `parsearCodigo` acepta exactamente lo que
  `formatearCodigo` produce (mismos ceros de relleno, ni uno más ni uno menos) y rechaza todo lo
  demás.
- **El UUID no lo genera el dominio.** El puerto `GeneradorId` (`src/puertos/generador-id.ts`) lo
  provee; su adaptador (`src/adaptadores/memoria/generador-id.ts`) usa `node:crypto` — no es un
  doble de test, es la implementación real (generar un UUID no depende de dónde se guarda).
- **La secuencia tampoco la calcula el dominio.** El puerto `Secuencias`
  (`src/puertos/secuencias.ts`, `siguiente(prefijo, anio)`) la provee; su doble en memoria
  (`src/adaptadores/memoria/secuencias.ts`) guarda un contador por combinación de prefijo y año,
  vivo solo mientras dura el proceso. El adaptador de Postgres (lote 7) resuelve la concurrencia de
  dos escritores con una fila bajo bloqueo — riesgo anotado, no resuelto en F0-19.
- **Propiedades con fast-check (F0-15).** Las tres propiedades de
  `tests/dominio/identificador.test.ts` (ida y vuelta, rechazo de basura, mutación de un carácter)
  usan el helper `propiedad()` de `tests/dominio/_arnes/propiedad.ts` en vez del generador propio
  (`mulberry32`) con que nació F0-19: mismas propiedades y mismos casos borde, motor real de
  búsqueda de contraejemplos. Ver *Propiedades (fast-check)*, en *Testing*.

## Testing: en qué nivel va cada cosa

Cuatro niveles desde F0-14, cada uno con su configuración. Tres son proyectos de Vitest
(`vitest.config.ts`); el e2e lo corre Playwright (`playwright.config.ts`), porque un `.spec.ts` de
Playwright Vitest no lo puede ejecutar (ADR 0014).

| Nivel | Carpeta | Qué va acá | Qué necesita | Con qué se corre |
|---|---|---|---|---|
| **dominio** | `tests/dominio/` | Reglas de negocio y funciones puras. **Sin red, sin base, sin reloj del sistema**. La tanda entera tarda menos de 10 s | nada | `npm run test:dominio` · `npm test` |
| **casos de uso** | `tests/casos-uso/` | Un caso de uso contra Postgres de verdad, o cualquier cosa que necesite la base | Docker | `npm test` |
| **extracción** | `tests/extraccion/` | Golden files: una entrada fija produce una salida fija (arnés `compararConGolden`, F0-16) | nada | `npm run test:extraccion` |
| **e2e** | `tests/e2e/` | Un camino completo en un navegador, contra la app levantada con compose | Docker y Chromium | `npm run test:e2e` |

`npm run test:todo` corre los cuatro. También están `tests/contratos/` (suites que un puerto y su
doble tienen que cumplir los dos, desde el lote 5) y `tests/fixtures/` (archivos que las
herramientas TIENEN que rechazar: no son tests y no los corre nadie).

**El nivel dominio no puede salir a la red, y no es un acuerdo: es el arnés.**
`tests/dominio/_arnes/sin-red.ts` (cargado con `setupFiles`) reemplaza `Socket.prototype.connect`
y `globalThis.fetch` por dos funciones que tiran `ErrorSinRed`. Un test de dominio que abra un
socket —directo, o porque se trajo un cliente de base— falla con un mensaje que dice a qué nivel
va. El propio arnés está probado en `tests/dominio/_arnes/sin-red.test.ts`.

**El nivel casos de uso comparte un solo Postgres por corrida.** Un test de este nivel **no**
levanta su contenedor: lo levanta una vez el `globalSetup` (`tests/casos-uso/_arnes/contenedor.ts`),
que además deja migrada la base compartida. Desde el test:

```ts
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

beforeAll(() => { prisma = crearClientePrisma(uriBaseCompartida()); });
beforeEach(async () => { await limpiarBase(); });   // TRUNCATE: base limpia por test
```

`crearBaseVacia(nombre)` da una base sin migrar (adentro del mismo contenedor) para lo que
necesite partir de cero, y `psqlEn(base)` corre `psql` adentro del contenedor. Los archivos de este
nivel corren de a uno (`fileParallelism: false`): comparten la base. Nada sobrevive a la corrida.

**El e2e levanta la imagen que se publica, no `next dev`.** El `webServer` de Playwright corre
`npm run e2e:app`: construye la imagen (`npm run imagen`) y levanta con compose el servicio `app`
del perfil `e2e` (que no se levanta con `docker compose up -d`); el `globalTeardown` borra **solo**
ese contenedor, sin tocar el Postgres de compose ni su volumen. Chromium únicamente, sin
reintentos. La primera vez hay que instalar el navegador: `npx playwright install chromium`
(RUNBOOK, sección 16).

**Dónde poner un test nuevo.** Si no necesita nada de afuera, dominio (y si "no le alcanza", casi
siempre es que falta inyectar algo, no que necesite otro nivel). Si necesita la base, casos de uso.
Si es "esta entrada tiene que seguir dando esta salida", extracción. Si hace falta un navegador,
e2e — y ahí se es tacaño: el e2e es el nivel más lento y el más frágil.

**Propiedades (fast-check, F0-15, ADR 0015).** `fast-check` (versión exacta) es el motor de
propiedades del nivel dominio. `tests/dominio/_arnes/propiedad.ts` fija la configuración
compartida para no repetirla en cada archivo:

- `numRuns`: 1000 en CI, 200 en local — CI se detecta igual que en el resto del repo, con la
  variable de entorno `CI`.
- **La semilla se anuncia una vez al empezar la tanda, pase o falle.** `tests/dominio/_arnes/semilla.ts`
  (`globalSetup` del proyecto `dominio`) imprime `[fast-check] semilla=... numRuns=...` antes del
  primer test. Sin `FC_SEED`, la semilla es al azar (`Date.now()`); con `FC_SEED=<número>`, es esa.
  **Para reproducir cualquier corrida de la tanda de dominio, semilla incluida:**
  `FC_SEED=<semilla impresa> npm run test:dominio`.
- `propiedad(...arbitrarias, predicado)` — mismos argumentos que `fc.property` — corre
  `fc.assert(fc.property(...), configuracion())`. `configuracion()` queda disponible para quien
  necesite llamar a `fc.assert`/`fc.check` directo (como el meta-test de abajo); lee la semilla con
  `inject("semillaFastCheck")` (el mismo mecanismo `provide`/`inject` que usa el arnés de casos de
  uso para los datos del contenedor).

`tests/dominio/_arnes/fast-check.test.ts` es un **meta-test permanente** (no una demostración de
una sola vez): corre una propiedad deliberadamente falsa ("para todo par de enteros, `a + b` es
mayor que `a`") con `fc.check` y afirma `failed === true` con contraejemplo. Si fast-check dejara
de buscar contraejemplos de verdad, este test se pone en rojo — es la prueba de que el motor
funciona, no de que el dominio es correcto.

Las propiedades de negocio de `tests/dominio/reloj.test.ts` e
`tests/dominio/identificador.test.ts` (ver *Identificadores*, más arriba, y
`src/dominio/compartido/reloj.ts` en *Estructura*) usan este helper desde F0-15.

## Mutation testing

*"Es la única forma de saber si los tests sirven o solo dan verde"* (F0-17, plan P2). Stryker
(`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`, `10.0.0` exacto) muta **solo**
`src/dominio/**` y corre el nivel `dominio` contra cada mutante. Decisiones y porqués en el
ADR 0017.

- **`npm run test:mutacion`** (`stryker run`) corre a mano. `.github/workflows/mutacion.yml` la
  corre además **los lunes** y a pedido (`workflow_dispatch`), **fuera** del job `ci`: el ruleset
  de `main` (F0-06) solo exige `ci`, así que esta corrida **nunca bloquea un merge**. Si el
  puntaje cae debajo del umbral, el workflow queda en rojo (visible en *Actions*) y el informe
  HTML queda de artefacto (`reports/mutacion/`, no versionado — ver `.gitignore`).
- **`stryker.config.mjs`** apunta a `stryker.vitest.config.ts`, no a `vitest.config.ts`: un
  archivo aparte con un solo proyecto de Vitest (el nivel `dominio`, mismo `include` y mismo
  arnés sin red), para que mutar el dominio nunca necesite Docker ni toque `casos-uso` ni
  `extraccion`. Si el proyecto `dominio` de `vitest.config.ts` cambia, replicar el cambio ahí.
- **`vitest` está fijado en `4.1.11` exacto, no en `5.x`.** `@stryker-mutator/vitest-runner@10.0.0`
  no activa los mutantes con `vitest` 5.0.0/5.0.1 (puntaje incorrecto, verificado a mano: ver ADR
  0017); salió antes de que `vitest` 5 existiera. No hay forma de darle a Stryker una copia propia
  de `vitest` sin dársela a todo el repo (`vitest` es su *peerDependency*, y npm no arma una copia
  anidada cuando la raíz ya declara la suya). **Antes de subir `vitest` de mayor:** aplicar a mano
  una mutación conocida (por ejemplo, cambiar `dia ?? ""` por `dia && ""` en
  `src/dominio/compartido/reloj.ts`), confirmar que rompe `npm run test:dominio`, y confirmar que
  `npm run test:mutacion` la marca *"Killed"* — si aparece *"Survived"*, el puntaje que informe no
  vale y no hay que confiar en él.
- **El umbral (`thresholds.break`) es provisorio.** F0-17 lo fija en el puntaje real de la primera
  corrida sobre el dominio tal como estaba ese día, redondeado hacia abajo. El umbral inicial
  **definitivo** se fija en el cierre del lote 5 (esqueleto del dominio completo) y desde ahí solo
  sube: nunca baja.

## Formato y lint

Biome (`biome.json`, raíz del repo) hace las dos cosas en una sola herramienta: formato y lint.
`npm run lint` corre `biome check .`, que es **verificación**, no escribe nada; agregando
`-- --write` aplica formato y los arreglos seguros de lint.

- **Alcance.** `src/` (`.ts` y `.tsx`), `tests/` (menos `tests/fixtures/`, que un lint normal no
  puede tocar — es donde viven los fixtures que **tienen** que fallar), `scripts/`, `prisma/`
  (F0-10: `seed.ts`) y los archivos de config de la raíz (`*.ts` —`next.config.ts` incluido—,
  `*.json` menos `package-lock.json`, y `.dependency-cruiser.cjs`). Lo que genera Next (`.next/` y
  `next-env.d.ts`), el cliente de Prisma (`src/adaptadores/prisma/generado/`, ADR 0008) y los
  golden files (`tests/extraccion/golden/`, F0-16) quedan afuera: no es código nuestro, lo escribe
  una herramienta (`prisma generate` uno, `npm run test:golden:update` el otro) y el formato de
  Biome para JSON (colapsa arrays cortos en una línea) pelearía con el `JSON.stringify` legible y
  determinístico de `compararConGolden`.
- **Reglas en `error`, ninguna en `warn`.** Biome trae reglas de `recommended` con severidad mixta
  (`warn` en varias, `error` en otras) — un lint que solo emite `warn` no hace fallar `biome
  check` y no cumple el criterio. `biome.json` fija en `"error"`, rule por rule, las que
  `recommended` deja en `warn` o `info`, más las cinco que pide el criterio de F0-02
  (`noExplicitAny`, `noUnusedVariables`, `noUnusedImports`, `noNonNullAssertion`, `useConst`).
  `a11y` y `security` ya vienen en `error` en `recommended`, sin overrides. Ver ADR 0003 (por qué
  no alcanza con `--error-on-warnings`, y qué revisar si Dependabot sube la versión de Biome).
- **La regla del reloj (F0-18).** Un `override` sobre `**/src/dominio/**` pone
  `style/noRestrictedGlobals` en `error` para la global `Date`: dentro del dominio la fecha del
  sistema no se llama, se inyecta un `Reloj` (`src/dominio/compartido/reloj.ts`). Fuera del
  dominio la regla no existe, porque traducir entre `FechaHora` y `Date` es trabajo de los
  adaptadores. Ver ADR 0012.
- **Prueba de que rechaza.** Dos fixtures, que `npm run lint:fixtures`
  (`scripts/lint-fixtures.ts`) corre por separado invocando el binario de Biome con `cwd` en la
  carpeta de cada uno, imprimiendo su salida de error e **invirtiendo** el código de salida: sale
  0 si cada fixture fue rechazado por sus reglas, desde los archivos esperados y sin tocar los
  archivos permitidos; 1 si alguno fue aceptado, si falta un diagnóstico o si aparece uno donde no
  correspondía.
  - `tests/fixtures/lint/debe-fallar.ts` (F0-02) tiene un `any` explícito y una variable sin usar
    (dos reglas independientes, para que el rechazo de una no tape que la otra dejó de andar).
    Como el lint normal excluye `tests/fixtures/`, esa carpeta tiene su propio `biome.json`
    (`"root": true`, no hereda nada de la raíz) solo con esas dos reglas.
  - `tests/fixtures/lint/reloj-inyectado/` (F0-18) replica la estructura `src/...` que la regla
    por ruta necesita, y su `biome.json` sí **extiende** el de la raíz: así prueba la regla de
    verdad y no una copia (si alguien la saca de `biome.json`, el fixture pasa el lint y este
    comando se pone en rojo). Trae además el caso permitido, `src/adaptadores/reloj/usa-date.ts`:
    el mismo código fuera del dominio, que **no** tiene que aparecer como violación.
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
solo por tipos" están decididos en el ADR 0004; lo de Next, en el ADR 0005. `no-circular` no mira
los ciclos que empiezan en el cliente generado de Prisma (`src/adaptadores/prisma/generado/`, ADR
0008); importarlo desde el núcleo sigue siendo violación (fixture `casos-uso-sin-afuera`).

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
    Cómo se hace: `docs/convenciones-base.md` (sección *Base de datos*).
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
mensaje claro en castellano que dice qué tarea lo trae (como fue `scripts/db-migrate-pendiente.ts`
para `db:migrate` hasta F0-08). Se reemplaza por la herramienta real en la tarea que corresponda,
sin dejar rastro del placeholder. (Los dos placeholders que hubo ya se borraron:
`scripts/pendiente.ts` en F0-04 y `scripts/db-migrate-pendiente.ts` en F0-08.)

**...una variable de entorno (F0-04).** En la misma tarea: al esquema de
`src/infraestructura/entorno.ts` (con el tipo más estrecho posible: `z.enum`, `z.url()`...), su
caso en `tests/dominio/entorno.test.ts` (ausente, inválida, válida), y a `.env.example`: **sin
valor si es secreta** (`NOMBRE=`), con su único valor válido en local si no lo es (como
`APP_ENTORNO=local`). Si hace falta en el servidor o en CI, el paso manual va a `RUNBOOK.md`.
Si la app la exige al arrancar, también a la lista de `--env` con que `scripts/imagen.ts` levanta
el contenedor de prueba (con un valor ficticio) y a los `docker run` del `RUNBOOK.md` (secciones 14
y 15). Excepción decidida (F0-08): la `DATABASE_URL` de `.env.example` lleva valor aunque en el
servidor sea secreta, porque apunta al Postgres local de compose, con credenciales ficticias.

**...una migración (F0-08, F0-09).** Siguiendo `docs/convenciones-base.md`, *El ciclo de una
migración*: `schema.prisma` → `npx prisma migrate dev --create-only --name <nombre>` → `down.sql`
con `prisma migrate diff` (sin `BEGIN`/`COMMIT`) → revisión a mano de los dos → `npm run
db:migrate` y `npm run db:generar` (y, si querés, `db:migrate:down` y `db:migrate` otra vez) →
commit de `schema.prisma`, `migration.sql` y `down.sql` juntos → `npm test` en verde (el test de
migraciones la toma sola). Una tabla nueva sigue los nombres de P6 (en esa misma página) y nace en
la tarea que la usa.

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

**...algo a la imagen Docker (F0-07).** Lo que la imagen necesita adentro va al `Dockerfile` (a la
etapa que corresponda: `dependencias` y `construccion` tienen el código y las herramientas; `final`
solo lo que corre en producción) y, si es un archivo del repo, se saca del `.dockerignore` **con el
motivo escrito al lado**; `.env` y `.env.*` no se sacan nunca. Si es algo que hay que **verificar**
de la imagen, va como una verificación más de `probar` en `scripts/imagen.ts`, que suma su problema
a la lista en vez de cortar en el primero. Un paso del workflow que no necesita `node_modules` (los
de la imagen, gitleaks) se condiciona al checkout (`steps.codigo.outcome`), no a `npm ci`. Y el
tamaño de la imagen se anota en el ADR 0007 si cambió de manera apreciable.

**...un puerto nuevo (F0-19).** La interfaz en `src/puertos/<nombre>.ts`: `type`, no `interface`
(estilo del repo), solo puede nombrar tipos de `src/dominio` (o de otros puertos) — nada de
paquetes npm ni `node:*`, aunque el doble los vaya a necesitar (`puertos-solo-dominio`). Su doble
en `src/adaptadores/memoria/<nombre>.ts` (o el adaptador real si no hace falta doble, como
`generador-id.ts` con `node:crypto`): una función `crear<Nombre>()` que devuelve un objeto que
implementa la interfaz, no una clase (estilo del repo, ver `crearClientePrisma`). Si el puerto
tiene más de una implementación, su suite de contrato entra a `tests/contratos/` (vacío hasta
entonces, `tests/contratos/README.md`); con una sola, alcanza con probarlo desde el test de
dominio que lo usa.

**...una clave a `configuracion` (F0-10).** Una entrada más en
`CONFIGURACION_POR_DEFECTO` de `prisma/seed.ts`, con su `clave` y su `valor` por defecto (los dos,
`String`: quien la lee convierte). `sembrar` la toma sola: no hace falta tocar el test. Un dato de
negocio real en el valor por defecto no entra (regla 1); si hiciera falta uno, se decide en la
tarea que lo necesita.

**...un golden nuevo (F0-16).** Escribí el test con `compararConGolden("<nombre>", valorFijo)`
(`tests/extraccion/_arnes/golden.ts`) contra un valor fijo, **sin fechas del sistema** (`Date`
tira error a propósito) ni datos reales (regla 1): va a fallar porque el golden todavía no existe.
Corré `npm run test:golden:update` una vez para que lo escriba (lo avisa en pantalla), revisá a
mano el diff de `tests/extraccion/golden/<nombre>.json` y commiteá los dos juntos. CI nunca corre
`test:golden:update`: si falta un golden, `npm run test:extraccion` queda en rojo, no lo crea. Para
cambiar un golden existente a propósito, mismo camino: cambiás qué produce el valor, corrés
`test:golden:update`, revisás el diff.

**...una operación de fecha al dominio (F0-18).** A `src/dominio/compartido/reloj.ts`, con su test
en `tests/dominio/reloj.test.ts`, escrita sobre `diasDesdeCivil` / `civilDesdeDias` (aritmética
entera) y nunca sobre `Date`, `Temporal` ni `Intl`: el dominio no puede importar nada y la global
`Date` está prohibida ahí por lint. Si la operación tiene un caso de borde con nombre (fin de mes,
29 de febrero), se decide explícitamente, se documenta en el ADR 0012 y se prueba como caso **y**
como propiedad. Para leer la hora, un `Reloj` inyectado: ningún módulo del dominio la averigua por
su cuenta. Traducir entre `FechaHora` y `Date`/`Temporal` —y aplicar la zona horaria— se hace en
los adaptadores, con `crearFechaHora` o `parsearISO` como puerta de entrada.

**...un ciclo de estados (F0-21).** El estado de una entidad no es un campo: es un
`Historial` de eventos que solo se agrega. Se declara una vez, con su tabla de transiciones y la
aritmética de fechas del reloj: `definirCiclo<Estado>({ transiciones, diferenciaEnDias })`
(`src/dominio/compartido/historial.ts`). La tabla lista, por cada estado, a cuáles se puede pasar;
un estado terminal lleva lista vacía. `crear` y `agregar` devuelven un historial nuevo y congelado,
y `agregar` devuelve `Resultado`: una transición no declarada no lanza, se rechaza con
`CODIGO_TRANSICION_INVALIDA` y la posición en que se cortó. **Ninguna operación modifica ni borra
un evento pasado**, y no se agrega una que lo haga. La marca de tiempo entra por parámetro (el
dominio no consulta la fecha del sistema) y los tipos de `en`, `actor` y `origen` son parámetros
de tipo hasta que F0-22 los fije (ADR 0010).

**...un ADR.** Archivo nuevo `docs/adr/NNNN-titulo-corto.md`, con la misma estructura que
`docs/adr/0001-excepcion-claude-md.md` y `docs/adr/0002-any-explicito-en-typecheck.md`: Contexto ·
Decisión · Alternativas descartadas · Consecuencias · Cómo se revierte. Numeración correlativa,
nunca se reutiliza, aunque el plan haya sugerido otro número para una tarea futura (el plan es una
estimación; el orden real de creación manda).

## Estructura

```
src/dominio          puro; solo importa de sí mismo. Hoy: compartido/reloj.ts (Reloj inyectable y FechaHora, F0-18); desde F0-19: compartido/identificador.ts (Identificador<Marca>, CodigoLegible, que usa el reloj para el año); compartido/historial.ts (ciclos de estado, F0-21)
src/casos-uso        orquesta dominio contra puertos (vacío hasta el lote 5)
src/puertos          interfaces. Desde F0-19: secuencias.ts, generador-id.ts
src/adaptadores      implementaciones: prisma, disco, s3, identidad, dobles. Hoy: prisma/generado/ (cliente generado, sin versionar), prisma/cliente.ts (el cliente con el adaptador pg) y memoria/ (F0-19: secuencias.ts, generador-id.ts)
src/infraestructura  entorno.ts (Zod) · version.ts · log (F0-24) · arranque/ = punto de armado
src/app              Next.js (App Router): página de inicio, layout raíz, api/salud
src/instrumentation.ts  lo levanta Next al arrancar: valida el entorno. Cuenta como app
src/worker           proceso aparte: planificador + jobs (vacío hasta el lote 6)
tests/               los cuatro niveles (ver *Testing*): dominio (con _arnes/sin-red.ts) · casos-uso (_arnes/: un Postgres para toda la tanda) · extraccion (_arnes/golden.ts) · e2e (Playwright, _arnes/apagar-app.ts) · contratos · fixtures
scripts/             utilidades de los comandos de package.json (sin-any.ts, db-migrate-down.ts, db-seed.ts, test-dominio.ts, e2e-app.ts; lib/migraciones.ts)
next.config.ts       configuración de Next: standalone, versión del build, agentRules
vitest.config.ts     los tres niveles que corren con Vitest (proyectos dominio, casos-uso, extraccion)
playwright.config.ts el nivel e2e: Chromium y el webServer que levanta la app con compose
prisma/              schema.prisma · migrations/<marca>_<nombre>/{migration.sql, down.sql} · seed.ts (el mecanismo, F0-10)
prisma.config.ts     configuración de la CLI de Prisma: rutas y DATABASE_URL
docker-compose.yml   servicios locales: Postgres 16 (MinIO llega en F0-27) y, detrás del perfil `e2e`, la app para el e2e
Dockerfile           imagen multi-stage de la app (y del worker desde F0-25) · .dockerignore
docs/                arquitectura.md (capas y límites) · convenciones-base.md (migraciones) · adr/ · ensayos/ (registro de cada ensayo de deploy)
infra/               oracle/bootstrap.sh (levanta la instancia del ensayo, F0-12) · servidor/ (compose del servidor, F0-13)
.github/             workflows/ci.yml (el check `ci` y el job `publicar`) · CODEOWNERS · dependabot.yml
```

Cada carpeta de `src/` y `tests/` tiene su propio `README.md` explicando qué va a vivir ahí y
desde qué tarea.

## Nunca

- Commitear secretos, `.env`, datos reales, documentos de negocio.
- Push directo a `main`.
- Cambiar stack, arquitectura o dependencias sin ADR aprobado.
- Marcar algo como terminado sin evidencia del tester y CI en verde.
- Tocar el servidor a mano: todo por script y por workflow.
