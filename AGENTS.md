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
| `docker compose up -d --wait` | Levanta el Postgres 16 local y MinIO (el almacén de documentos S3, con su bucket creado por `minio-init`; F0-27) de `docker-compose.yml` y espera a que estén sanos. `docker compose ps` → `(healthy)`; `docker compose down` lo apaga (`-v` borra el volumen). Necesita Docker corriendo |
| `npm run arrancar` | `scripts/arrancar.ts` (F1-01): levanta todo en local con un paso. Chequea que haya dependencias al día (`node_modules/next` existe y `package-lock.json` no es más nuevo que `node_modules/.package-lock.json`; si no, sale 1 pidiendo `npm ci`: nunca instala), que Docker responda y que el puerto 3000 esté libre (si no, sale 1 con un mensaje en castellano y no escribe nada), copia `.env.example` a `.env` si falta, levanta solo `postgres` de compose (`--wait`), **regenera el cliente de Prisma siempre** (`prisma generate`, F1-08: un esquema nuevo no exige `npm ci`), corre `db:migrate` y `db:seed`, imprime la URL y el email de prueba (`ADMIN_INICIAL_EMAIL`), **borra `.next/dev`** (la caché de `next dev`, siempre; no toca el resto de `.next`) y deja `next dev` andando. Al cortar con Ctrl+C la base queda levantada. Se puede correr dos veces. RUNBOOK sección 1 |
| `npm run dev` | `next dev`: la app en `http://localhost:3000`. Necesita `.env` (copiá `.env.example`); si falta una variable o es inválida, **no arranca** (sale 1 y dice cuál). Ver *Next.js y entorno* |
| `npm run build` | `next build` con `output: "standalone"`: compila, corre `tsc` y deja `.next/standalone/server.js`. **No necesita `.env`**; sí git o `APP_VERSION` (la versión del latido) |
| `npm run worker` | `node src/worker/index.ts` (F0-25, ADR 0025): el proceso worker, con el TypeScript nativo de Node 24 (sin compilar). Valida el entorno con el esquema de la app (sin `DATABASE_URL` válida **no arranca**: sale 1 y dice cuál), levanta el planificador (`croner`) y registra cada corrida en `corridas_worker`. Necesita la base levantada y migrada; lee `.env` solo si lo cargás vos (`node --env-file=.env src/worker/index.ts`). RUNBOOK sección 17 |
| `node .next/standalone/server.js` | El servidor de producción, después de `npm run build` (no es un script de `package.json`). Toma las variables del entorno del proceso (`APP_ENTORNO=local node .next/standalone/server.js`) o del `.env` que el build copió si existía al compilar; `PORT` cambia el puerto |
| `npm run lint` | `biome check .` — Biome en modo verificación (lint + formato) sobre `src/`, `tests/` (menos `tests/fixtures/`), `scripts/` y los archivos de config de la raíz — y después `scripts/sin-error-crudo.ts`, que rechaza `throw new Error` y `new ErrorSistema(` en `src/dominio/` y `src/casos-uso/` (F0-23, ADR 0020), y `scripts/sin-marcas-conflicto.ts` (M-03), que recorre los archivos versionados (`git ls-files`) y rechaza, nombrando `archivo:línea`, una línea que empiece con `<<<<<<< ` o `>>>>>>> ` o que sea exactamente `=======` (saltea binarios; única excepción: `tests/fixtures/lint/conflicto/`). `-- --write` aplica los arreglos de Biome |
| `npm test` | Vitest sobre los niveles `dominio` y `casos-uso` (ver *Testing: en qué nivel va cada cosa*): el ciclo de siempre. **Necesita Docker corriendo** (el nivel casos de uso levanta un Postgres y, para el almacén S3, MinIO: en Testcontainers y con los servicios de `docker-compose.yml` en un proyecto y un puerto al azar); no necesita `.env` ni tener compose levantado |
| `npm run test:dominio` | Solo el nivel `dominio`, con su reloj: `scripts/test-dominio.ts` mide la corrida entera y **sale 1 si tarda más de 10 s** (criterio de F0-14). No necesita nada: el nivel dominio no abre red ni base |
| `npm run test:extraccion` | Solo el nivel `extraccion` (golden files): el arnés `compararConGolden` (F0-16) y su caso de ejemplo |
| `npm run test:golden:update` | Regenera **a propósito** los goldens de `tests/extraccion/golden/` (`ACTUALIZAR_GOLDEN=si`) y lo avisa en pantalla. CI nunca lo corre; revisá el diff a mano antes de commitear (F0-16) |
| `npm run test:e2e` | Playwright (Chromium) sobre `tests/e2e/`: levanta la app con compose —la imagen que se publica— y recorre el camino de humo. Necesita Docker corriendo y el navegador instalado una vez (`npx playwright install chromium`, RUNBOOK sección 16). `-- --ui` abre la interfaz de Playwright; `-- --headed`, el navegador a la vista |
| `npm run test:todo` | Los cuatro niveles: `vitest run` (dominio, casos de uso, extracción) y después el e2e |
| `npm run test:mutacion` | Mutation testing (F0-17): `stryker run` muta `src/dominio/**` y corre el nivel `dominio` (`stryker.vitest.config.ts`, no `vitest.config.ts`: no necesita Docker) por cada mutante. No es parte del ciclo de un PR (tarda más y no lo exige el check `ci`): corre a mano o los lunes en `.github/workflows/mutacion.yml`. Ver *Mutation testing* y ADR 0017 |
| `npm run e2e:app` | No se llama a mano: es el `webServer` de `playwright.config.ts`. Construye la imagen (`npm run imagen`), levanta el servicio `app` del perfil `e2e` de compose y espera el latido. Lo apaga `tests/e2e/_arnes/apagar-app.ts` al terminar el e2e |
| `npm run typecheck` | `tsc --noEmit` (TypeScript severo, `.ts` y `.tsx`) y después `scripts/sin-any.ts`, que rechaza cualquier `any` explícito (TypeScript no tiene opción de compilador para eso — ver ADR 0002; saltea lo que generan Next, ADR 0005, y Prisma, ADR 0008) |
| `npm run typecheck:fixtures` | Prueba negativa de lo anterior: corre el mismo chequeo sobre `tests/fixtures/typecheck/*.ts`, que **tienen** que ser rechazados. Sale 0 si los rechazó a todos, 1 si aceptó alguno |
| `npm run lint:fixtures` | Prueba negativa de `lint`: corre Biome sobre cada fixture de `tests/fixtures/lint/`, por separado. `debe-fallar.ts` **tiene** que ser rechazado por `noExplicitAny` **y** `noUnusedVariables`; `reloj-inyectado/` por la regla del reloj (`noRestrictedGlobals` sobre `Date`), y solo desde `src/dominio/`; `error-crudo/` por `scripts/sin-error-crudo.ts` (`throw new Error` y `new ErrorSistema(`), y solo desde `src/dominio/` y `src/casos-uso/`; `conflicto/` por `scripts/sin-marcas-conflicto.ts` (`rechazado.md`, con los tres marcadores; `permitido.md`, con `=======` dentro de una línea y un subrayado setext de otra longitud, tiene que quedar limpio). Sale 0 si cada uno fue rechazado por sus reglas y el caso permitido quedó limpio; 1 si alguno pasó, falta un diagnóstico o sobra uno |
| `npm run limites` | dependency-cruiser (`.dependency-cruiser.cjs`) sobre `src/`, `tests/` y `scripts/`: los límites entre capas, `no-circular` y `no-orphans`, todos en `error`. Ver *Límites de arquitectura* |
| `npm run limites:fixtures` | Prueba negativa de `limites`: corre dependency-cruiser sobre cada carpeta de `tests/fixtures/limites/` (una por regla), por separado. Sale 0 si cada una fue rechazada por **su** regla y desde los archivos esperados; 1 si alguna pasó, la rechazó otra regla, o hay una regla sin fixture |
| `npm run verificar` | `scripts/verificar.ts` (M-01): corre `typecheck`, `lint`, `limites`, `test` y los `*:fixtures` que haya en `package.json`, en ese orden, una línea `✔`/`✘ <paso> (<segundos> s)` por paso; si uno falla, muestra sus últimas 60 líneas y para (sale ≠ 0). La salida completa de cada paso queda en `.verificar/<paso>.log`. `-- --seguir` corre todos igual y suma cuántos fallaron. Usalo durante el desarrollo en vez de los cuatro comandos sueltos |
| `npm run imagen` | Construye la imagen Docker: `docker build` multi-stage con `--build-arg APP_VERSION` (el SHA corto de git, o `APP_VERSION` si está definida). Sin etiqueta, `seism-gestion:local`; `-- <etiqueta>...` construye con las que le pases (es lo que hace CI al publicar). Necesita Docker corriendo, no necesita `npm ci` |
| `npm run imagen:prueba` | Levanta esa imagen, espera el `HEALTHCHECK`, pide `/` y `/api/salud`, compara la versión con la del build, verifica que no lleve `.env` ni variables de más y que entre en el tope de tamaño. Informa **todas** las verificaciones que fallaron. `-- <etiqueta>` para probar otra |
| `npm run db:migrate` | `scripts/db-migrate.ts`: lee `.env` si existe, **valida el entorno** (el mismo esquema que la app) y recién entonces corre `prisma migrate deploy`, que aplica las migraciones pendientes de `prisma/migrations/` (desde una base vacía o una ya migrada). Si `DATABASE_URL` falta o no es `postgresql://`/`postgres://`, **sale 1** nombrando la variable y Prisma ni se ejecuta. Necesita la base levantada |
| `npm run db:migrate:down` | `scripts/db-migrate-down.ts`: valida el entorno igual que `db:migrate` y revierte **la última migración aplicada** en la base local de compose: su `down.sql` y el borrado de su fila de `_prisma_migrations`, en una transacción (así `db:migrate` la vuelve a aplicar). Una por corrida. Sale 1 si `DATABASE_URL` no apunta a `localhost` (no ejecuta nada), si no hay migraciones aplicadas o si la reversión falla. Necesita el servicio `postgres` de compose levantado. Ver ADR 0009 |
| `npm run db:generar` | `prisma generate`: regenera el cliente en `src/adaptadores/prisma/generado/` después de cambiar `prisma/schema.prisma`. No se conecta a ninguna base |
| `npm run db:seed` | `scripts/db-seed.ts`: valida el entorno igual que `db:migrate` y corre `prisma/seed.ts` (idempotente) con el cliente real de Prisma (`src/adaptadores/prisma/cliente.ts`, con `@prisma/adapter-pg`): las claves de `configuracion` y, desde F0-30, el **primer administrador** con el email de `ADMIN_INICIAL_EMAIL` (obligatoria), si no hay ya un usuario con ese email, y, desde F1-03, los datos de demostración (tres grupos inventados), solo con `APP_ENTORNO` `local` o `ci`. Sale 1 sin sembrar nada si `APP_ENTORNO=servidor` y falta `SEED_PERMITIDO=si`. Necesita la base levantada |

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
  camino de humo contra la app levantada con compose; M-06 y M-08: el navegador son dos pasos, el
  intento 1 y el reintento, cada uno con su `timeout-minutes: 2`, sin `apt-get`) y gitleaks sobre los commits nuevos (los del
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
- **El navegador del e2e (M-06, M-08).** `npx playwright install chromium` **sin `--with-deps`**: eso
  corre `apt-get` contra el espejo de Ubuntu del runner y el 2026-09-30 y el 2026-10-01 se colgó en los
  dos intentos; ningún paso del workflow ejecuta `apt-get`, `dpkg` ni `install-deps`. Las librerías del
  sistema que Chromium necesita vienen en la imagen del runner. Si una imagen nueva dejara de traer alguna,
  `test:e2e` falla con el error textual de Chromium (la lista de paquetes que faltan): se instala esa
  lista a propósito, no se vuelve a `--with-deps`. Son dos pasos, `Navegador del e2e (Chromium), intento 1`
  y `intento 2`, cada uno con `timeout-minutes: 2`, porque la descarga sale de la CDN de Playwright y
  también puede fallar: el intento 1 lleva `continue-on-error` (el único del workflow) y el 2 corre solo
  si el 1 no salió bien; si el 2 falla, `::error::no se pudo instalar Chromium...` y el check queda en
  rojo. Peor caso: 2 min + 2 min. Con la caché `~/.cache/ms-playwright` en *hit* no se baja nada.
  `test:e2e` corre si alguno de los dos intentos salió bien.
- **Tope: 10 minutos** (P9, `timeout-minutes` en cada job). Hoy (M-08, 5 corridas medidas) el job `ci`
  tarda entre 3:32 y 4:23, con el navegador del e2e entre 0 y 9 s (9 s con la caché en *miss*, bajando
  Chromium de la CDN de Playwright); la meta es quedar por debajo de 8 minutos. Si pasa de 10, el check queda en rojo y es un bug de CI.
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
  propio bloque (hoy solo `publicar`, con `packages: write`). Ningún paso con `continue-on-error`, salvo uno: el intento 1 del
  navegador del e2e (M-06), que tiene su reintento; si el reintento falla, el job queda en rojo con
  `::error::`. Toda acción de
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
  al repo) y `npm run dev`. Next lee `.env` solo. Las variables hoy: `APP_ENTORNO`,
  `DATABASE_URL` (F0-08; la de `.env.example` apunta al Postgres de `docker-compose.yml`) y
  `ADMIN_INICIAL_EMAIL` (F0-30: el primer administrador que crea `db:seed`; la de `.env.example`
  es inventada, `admin@ejemplo.test`, y la real nunca entra al repo), `LOG_NIVEL`, opcional (F0-24;
  vacía o sin definir, `debug` en local e `info` en `ci`/`servidor`) e `IDENTIDAD` (F0-31: `falsa`
  o `google`; con `APP_ENTORNO=servidor` la falsa se rechaza y la app no arranca; con `google` exige
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `APP_URL_PUBLICA`. Ver *Identidad y sesión*).
  El almacén de documentos (F0-27, ADR 0022): `ALMACEN` (`disco` | `s3`, obligatoria); con `disco`,
  `ALMACEN_DIRECTORIO`; con `s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` y
  `S3_REGION` (opcional, por defecto `auto`). Las `S3_*` de `.env.example` son las del MinIO de
  compose.
- **`.env` y `standalone`.** Si al compilar existe un `.env`, `next build` lo **copia** a
  `.next/standalone/.env` y `server.js` lo lee. Sin `.env` al compilar, las variables van en el
  entorno del proceso. Para la imagen Docker (F0-07): el `.env` no puede entrar al contexto del
  build (`.dockerignore`), o la imagen se lleva los valores adentro.
- **El entorno se valida al arrancar**, no al compilar: `src/instrumentation.ts` (lo levanta Next
  una vez, antes de atender pedidos) llama a `exigirEntornoValido` de
  `src/infraestructura/entorno.ts`. Si una variable falta o es inválida, escribe en stderr cuál
  (sin repetir el valor) y el proceso sale con código 1, en `next dev` y en `server.js`. `npm
  run build` no valida el entorno ni necesita `.env`. Con el entorno válido, instala los
  manejadores de `src/infraestructura/proceso.ts` (F0-24): una excepción o un rechazo que nadie
  capturó se loguea en `fatal` con `INF-0001` y el proceso sale con código 1 (lo reinicia Docker).
- **La versión del latido** (`GET /api/salud` → `{ ok: true, version }`) se fija al compilar:
  `next.config.ts` usa `APP_VERSION` si está definida (la pasa el build de Docker desde F0-07) o,
  si no, el SHA corto de git; sin ninguna, el build falla. Next reemplaza
  `process.env.APP_VERSION` por el literal en el código compilado.
- **Archivos de Next.** `page.tsx`, `layout.tsx` y `route.ts` los carga Next por su nombre, y
  `src/instrumentation.ts` tiene que vivir en la raíz de `src/` pero cuenta como parte de `app`
  para los límites. El layout raíz es el mínimo que exige el App Router (`<html lang="es">`) más
  los estilos globales (`src/app/globales.css`: Tailwind 4, configuración por CSS, `postcss.config.mjs`;
  sin modo oscuro).
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
  `node server.js` (la app) y el worker (F0-25) corre esta misma imagen con
  `node src/worker/index.ts`. La etapa `dependencias-worker` instala las `dependencies` de
  producción **menos** `next`, `react` y `react-dom` (ya están en el `standalone`), sin scripts,
  con solo el compilador de consultas de PostgreSQL de Prisma y sin tipos ni mapas; la final copia
  eso, el código que el worker importa y el cliente de Prisma generado. El `HEALTHCHECK` es el de la
  app: el worker corre con `--no-healthcheck` (o `healthcheck: disable` en compose). ADR 0025.
- **La versión entra como `--build-arg APP_VERSION`** (el SHA corto). `.git` no está en el contexto,
  así que **sin ese argumento el build falla**, a propósito (ADR 0005). `/api/salud` devuelve
  exactamente esa versión y la prueba la compara.
- **El `.env` no entra al contexto**, primera línea del `.dockerignore`: si existiera al compilar,
  `next build` lo copiaría al `standalone` y la imagen —pública— se lo llevaría adentro. También
  quedan afuera `.git`, `.github`, `node_modules`, `.next`, `tests/` y `docs/`.
- **`npm run imagen:prueba` es el test de esta parte**, y corre en CI: `HEALTHCHECK` sano, `/` y
  `/api/salud` con la versión del build, ningún archivo `.env` adentro, ninguna variable fuera de
  la lista permitida, ninguna capa que mencione un `.env`, el contenedor **sale 1 sin
  `APP_ENTORNO` ni `DATABASE_URL`** (nombrando las dos), el worker **sale ≠ 0 sin `DATABASE_URL`**
  (nombrándola) y **arranca** con el entorno completo (anuncia `worker arrancado` y sigue
  corriendo), y el tamaño por debajo de **250 MB** (hoy
  224 MB con el worker; 201 MB antes de F0-25, medido en CI). Falla nombrando **todas** las verificaciones que no pasaron. El contenedor de la prueba
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
- **La imagen de Postgres está en tres lugares (M-06).** La misma referencia
  `postgres:<tag>@sha256:<digest>` en `docker-compose.yml` (servicios `postgres` y `postgres-e2e`) y
  en `services: postgres` de `.github/workflows/ci.yml`. Para cambiarla, se cambian **los tres**:
  Dependabot (ecosistema `docker-compose`, con los majors de Postgres ignorados: se queda en 16.x)
  propone la subida de los dos de compose, y el de `ci.yml` se edita a mano con el mismo tag y
  digest. `tests/dominio/imagen-postgres.test.ts` (nivel dominio, en `npm test` y en CI) falla si
  las tres no son idénticas o si el arnés de casos de uso deja de leerla de compose.
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
  claves de `configuracion` con sus valores por defecto (hoy, `ia.tope_mensual_usd` en `"10.00"` e
  `ia.costo_estimado_usd.defecto` en `"0.01"`, F0-28) y,
  desde F0-30, el primer administrador (`ADMIN_INICIAL_EMAIL`) si no hay un usuario con ese email,
  con el actor de sistema `db-seed` y su registro de auditoría; a los demás usuarios no los toca
  (ADR 0024, `tests/casos-uso/usuarios-semilla.test.ts`). Desde F1-03 siembra además los **datos de demostración** (hoy, tres grupos inventados), por el repositorio del molde de ABM y con su auditoría, si `APP_ENTORNO` no es `servidor`; a un grupo que alguien cambió o dio de baja no lo repone. Idempotente por clave: si el valor no cambió, no escribe nada, así correrla dos veces deja la
  base exactamente igual (`id`, `creado_en` y `actualizado_en` incluidos); un test de casos de uso
  la corre dos veces contra un Postgres de Testcontainers y compara. `prisma/seed.ts` importa solo
  de `adaptadores` (el cliente generado y los repositorios) y del dominio: la validación de entorno y el permiso
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
esos contenedores (la app y su `postgres-e2e`, descartable, con puerto elegido por Docker, que
`scripts/e2e-app.ts` migra y siembra), sin tocar el Postgres de compose ni su volumen. Chromium únicamente, sin
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
- **Sin errores crudos (F0-23).** Biome no tiene regla para `throw new Error` (`useThrowOnlyError`,
  en `error`, solo frena lanzar lo que no es un `Error`). Lo hace `scripts/sin-error-crudo.ts`, la
  segunda mitad de `npm run lint`: con la API del compilador de TypeScript rechaza `throw new
  Error(...)`, `throw Error(...)` (y los demás errores nativos) y `new ErrorSistema(` en
  `src/dominio/` y `src/casos-uso/`. Ver ADR 0020 y *Cómo se agrega... un error*.
- **Sin `console.*` en `src/` (F0-24).** Un `override` sobre `**/src/**` pone
  `suspicious/noConsole` en `error`: en `src/` se loguea con el log de
  `src/infraestructura/log.ts` (ver *Cómo se agrega... un log*). En `scripts/` y `tests/`
  `console` sigue valiendo: son herramientas de consola.
- **Prueba de que rechaza.** Cinco fixtures, que `npm run lint:fixtures`
  (`scripts/lint-fixtures.ts`) corre por separado invocando el binario de Biome (o
  `sin-error-crudo`) con `cwd` en la carpeta de cada uno, imprimiendo su salida de error e **invirtiendo** el código de salida: sale
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
  - `tests/fixtures/lint/sin-console/` (F0-24), misma forma que el anterior: `console.log` en
    `src/infraestructura/` tiene que ser rechazado por `noConsole`; el mismo código en `scripts/`
    es el caso permitido.
  - `tests/fixtures/lint/error-crudo/` (F0-23) lo rechaza `sin-error-crudo`, no Biome: un
    `throw new Error` y un `new ErrorSistema(` en `src/dominio/`, y `throw Error`/`throw new
    RangeError` en `src/casos-uso/`. Casos permitidos: un adaptador que lanza `Error` y el archivo
    que define `ErrorSistema`.
  - `tests/fixtures/lint/conflicto/` (M-03) lo rechaza `scripts/sin-marcas-conflicto.ts`, la
    tercera parte de `npm run lint`: a diferencia de los otros, el script recibe los archivos por
    argumento (`rechazado.md` y `permitido.md`) y así no aplica su excepción por ruta.
- **`// biome-ignore` exige motivo.** Ninguno sin explicar por qué en el mismo comentario. Si
  Biome choca con código real, se arregla el código, no la regla.

## Identidad y sesión (F0-31, ADR 0027).

Quién es una persona lo dice Google (o la identidad falsa fuera del servidor); quién entra lo decide
la tabla `usuarios`. El puerto es `src/puertos/identidad.ts`; los adaptadores, `identidad-falsa` e
`identidad-google` (`arctic` + verificación del `id_token` con `node:crypto`); el flujo, `src/casos-uso/sesion/`;
las rutas, `src/app/(auth)/` (`/ingresar`, `/ingresar/callback`, `/salir`, `/sesion`). La cookie
`seism_sesion` es `httpOnly; SameSite=Lax; Path=/` y `Secure` salvo con `APP_ENTORNO=local`; la sesión dura
12 horas y **cada request se valida contra la base**, con caché de 30 s como máximo (revocar o cambiar el rol
invalidan la caché de ese usuario en el mismo proceso, F0-32: la siguiente request ya es `AUT-0002`). El helper para saber quién es la sesión actual es `sesionActual()`
(`src/app/(auth)/sesion-actual.ts`); la protección del panel (`accesoDeAdministrador()`) y el
actor de toda escritura (`actorDesdeSesion()`) son de F0-32, ver *Cómo se agrega... una página que exige
administrador* y ADR 0028. Cómo entrar con Google en local: RUNBOOK, sección 17.

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
6. **Todo error tiene código estable** del catálogo (`DOM-0001`,
   `src/dominio/compartido/errores/catalogo.ts`) y **un código nunca se reutiliza**. No existe
   `throw new Error` en `src/dominio` ni en `src/casos-uso`: lo frena `npm run lint`
   (`sin-error-crudo`). Ver *Cómo se agrega... un error* y ADR 0020.
7. **Ningún log con secretos ni datos personales.** Hay un test dedicado
   (`tests/casos-uso/log.test.ts`, F0-24) y en `src/` no se usa `console.*` (Biome, `noConsole`).
8. **La IA nunca escribe en el dominio.** Crea borradores o propone; un humano confirma. **Nadie
   le habla a un proveedor de IA fuera de `src/puertos/ia.ts`**, y a ese puerto solo le habla el
   caso de uso `interpretar` (`src/casos-uso/ia/`), que controla el tope de gasto, valida la
   salida con Zod y la registra en `uso_ia` antes de devolverla (F0-28, ADR 0026). Ningún SDK de
   proveedor se importa fuera de su adaptador.
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
16. **No existe borrado físico.** `marcarEliminado` (`src/dominio/compartido/auditable.ts`,
    F0-22) es la única forma de "borrar": marca `eliminadoEn`/`eliminadoPor`, nunca quita la fila.
    Ningún puerto de `src/puertos/**` (incluidos los de `repositorios/` cuando existan) declara un
    método `eliminar`/`borrar`/`delete`/`remove`/`destroy`/`purgar`; lo hace cumplir
    `tests/dominio/puertos-sin-borrado.test.ts`, que recorre las interfaces/tipos exportados con
    la API del compilador de TypeScript. Única excepción, justificada en el ADR 0024: las
    **sesiones** (`RepositorioSesiones.cerrarTodasDe`) sí se quitan, porque una sesión es una
    credencial, no un dato de negocio.
17. **Usuarios: solo los cambia un administrador.** `darDeAlta`, `revocar` y `cambiarRol`
    (`src/casos-uso/usuarios/`, F0-30) reciben un `Actor` obligatorio y exigen que sea una
    **persona** con usuario **administrador y activo** (`AUT-0003` si no); ninguno deja el sistema
    sin administradores activos (`AUT-0004`). Corren enteros en una transacción (`Transaccional`) y
    cada cambio deja su `RegistroAuditoria` (lo escribe el repositorio, F0-33). El único usuario
    que no crea un administrador es el primero, que crea `db:seed` (ADR 0024).
18. **Escribir exige identidad, por tipos (F0-33, ADR 0029).** Todo caso de uso que escribe
    (nombre con `crear`, `guardar`, `dar`, `revocar`, `cambiar`, `marcar` o `registrar`) recibe
    `Actor` como **primer parámetro obligatorio**, y los métodos de escritura de los repositorios
    de entidades (`RepositorioUsuarios.crear` y `.actualizar`) también: el adaptador deja la
    auditoría con ese actor. Lo hacen cumplir `tests/dominio/tipos/` (llamar sin actor no compila;
    un test lista las firmas de `src/casos-uso/**`; otro recorre `src/app/**`). Ver *Cómo se
    agrega...un caso de uso que escribe*.
19. **Ningún marcador de conflicto entra al repo (M-03).** Ninguna línea de un archivo versionado
    empieza con `<<<<<<< ` o `>>>>>>> `, ni es exactamente `=======`: un merge resuelto a mano
    que los deja pasa callado en un `.md`, un `.yml` o un `.json`. Lo hace cumplir
    `scripts/sin-marcas-conflicto.ts`, que corre dentro de `npm run lint` (así también en CI y
    en `npm run verificar`). Única excepción: `tests/fixtures/lint/conflicto/`. Un título
    Markdown subrayado con exactamente siete `=` se escribe con `#`.

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
servidor sea secreta, porque apunta al Postgres local de compose, con credenciales ficticias; lo
mismo `S3_ACCESS_KEY` y `S3_SECRET_KEY` (F0-27), que son las del MinIO local de compose. Una
variable que solo hace falta según el valor de otra (las `S3_*` con `ALMACEN=s3`) va en una rama
de `z.discriminatedUnion` del esquema, no como opcional: así el mensaje nombra la que falta.

Una variable **obligatoria** nueva tiene que estar en **cada lugar que arranca un proceso con un
entorno escrito ahí** (M-04), y eso lo controla `tests/dominio/entorno-en-cada-arranque.test.ts`:
arma el mapa nombre → valor de cada lugar y exige que `validarEntorno` lo acepte; si no, falla
nombrando **lugar y variable**. Los lugares:

1. `docker-compose.yml`: el `environment` de los servicios `app` y `worker`.
2. `.github/workflows/ci.yml`: el `env` (del paso y del job) de cada paso que corre `npm run db:*`.
3. `scripts/imagen.ts`: cada `docker run` de la app y del worker con `--env` (los `--env` de arriba).
4. `scripts/e2e-app.ts`: el `const entorno` con que migra y siembra la base del e2e.
5. `.env.example`.

Los tests que arman un `Entorno` tipado no entran: el compilador ya exige todas. Un valor
interpolado (`${X}`) se resuelve con la constante del mismo archivo o, si no se puede, con un valor
de ejemplo de la variable (`EJEMPLOS` en el test): una variable nueva con `NOMBRE=` vacío o
interpolada en algún lugar necesita su ejemplo ahí. Lo que arranca **a propósito** sin una variable
va en `EXCEPCIONES` del test, con el motivo (hoy: el worker de `imagen:prueba` sin `DATABASE_URL`);
el test afirma que ahí falta **solo** esa. Si agregás un lugar nuevo que arranca un proceso, sumale
su extractor (con su test de ejemplo) al mismo archivo. Los `docker run` de `README.md` y
`RUNBOOK.md` no los controla nada: se revisan a ojo.

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
(`if: ${{ !cancelled() && steps.dependencias.outcome == 'success' }}`), sin `continue-on-error`
(la única excepción es el intento 1 del navegador del e2e, ver *CI*).
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
tiene más de una implementación, su suite de contrato entra a `tests/contratos/`; con una sola,
alcanza con probarlo desde el test de dominio que lo usa.

**...un adaptador que tiene que pasar una suite de contrato (F0-27).** La suite es una función
exportada de `tests/contratos/<puerto>.ts` que recibe un nombre, una **fábrica**
(`() => Promise<Puerto>`, que se llama en un `beforeAll`, así puede esperar a un contenedor) y las
opciones que dependan del adaptador (como `numRuns`, con el porqué al lado); adentro declara sus
`describe`/`it`. Cada adaptador la llama desde **su** archivo de test del nivel que necesite
(disco en `tests/casos-uso/almacen-disco.test.ts`, S3 contra MinIO en
`tests/casos-uso/almacen-s3.test.ts`), y ahí mismo prueba lo que es solo suyo. Nunca una copia de
la suite por adaptador. Ejemplo: `suiteAlmacenDocumentos` (ADR 0022). Si el adaptador necesita un
contenedor, va en `tests/casos-uso/_arnes/` con la imagen leída de `docker-compose.yml` (una sola
fuente, como `imagenMinioDeCompose()`) y puertos al azar.

**...un adaptador real de un puerto con suite de contrato (F0-29).** Todo adaptador real de un
puerto con suite en `tests/contratos/` (Gmail, WhatsApp, Telegram, SMTP: Fase 1, para `Correo` y
`Notificaciones`) **tiene que pasar la misma suite** que su doble en memoria. La fábrica que le
pasás a `suiteCorreo`/`suiteNotificaciones` no llama a `sembrar()`/`enviados()` del doble (eso no
existe en un adaptador real): devuelve el puerto y una forma propia de preparar o leer estado
(`preparar`/`leerEnviados`), que en un adaptador real habla con la API real (o su sandbox de test),
no con una lista en memoria. Un archivo de test nuevo en el proyecto de Vitest que corresponda (sin
red ni base: `dominio`; si necesita Docker o red: `casos-uso`) invoca la suite con esa fábrica.
Los avisos al administrador (F0-25: cola de fallidos; F0-28: tope de gasto de IA) se mandan por
`src/puertos/notificaciones.ts`, **uno por cada administrador activo**, desde M-05 (ADR 0030):
`src/infraestructura/arranque/avisos.ts` arma `avisar` con el puerto y `RepositorioUsuarios`. En
Fase 0 el canal es `notificaciones-por-log` (`src/adaptadores/log/notificaciones.ts`, un `warn` con
el `usuarioId` y sin email), que pasa la misma suite de contrato.

**...una clave a `configuracion` (F0-10).** Una entrada más en
`CONFIGURACION_POR_DEFECTO` de `prisma/seed.ts`, con su `clave` y su `valor` por defecto (los dos,
`String`: quien la lee convierte). `sembrar` la toma sola: no hace falta tocar el test. Un dato de
negocio real en el valor por defecto no entra (regla 1); si hiciera falta uno, se decide en la
tarea que lo necesita.

**...un perfil de IA (F0-28).** Un perfil es un nombre (`"remito"`, por ejemplo) que el que llama
pasa a `interpretar({ perfil, entrada, esquemaSalida })`. Hace falta: (1) el esquema Zod de la
salida, en el caso de uso que lo usa (nunca se acepta una salida sin validar: si no valida, `IA-0002`);
(2) si su costo estimado no es el de `ia.costo_estimado_usd.defecto`, la clave
`ia.costo_estimado_usd.<perfil>` en `prisma/seed.ts` (dólares con punto, hasta seis decimales);
(3) en los tests, las filas de la tabla del doble (`crearIaDoble`, `src/adaptadores/ia-doble/`) con
entradas y salidas **inventadas**, incluida una salida que no valida; (4) quien llama atrapa
`IA-0001` (tope superado) por su código y sigue por reglas. El prompt y el adaptador real son de
Fase 1: el perfil no se lo pide a ningún proveedor directo (regla 8). Ver ADR 0026.

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
el código `DOM-0001` del catálogo (`catalogo.DOM_0001.codigo`) y la posición en que se cortó. **Ninguna operación modifica ni borra
un evento pasado**, y no se agrega una que lo haga. La marca de tiempo entra por parámetro (el
dominio no consulta la fecha del sistema) y los tipos de `en`, `actor` y `origen` son parámetros
de tipo hasta que F0-22 los fije (ADR 0010).

**...una moneda (F0-20).** Las monedas viven en **un** solo lugar: la constante `MONEDAS` de
`src/dominio/compartido/importe.ts` (hoy `"ARS"` y `"USD"`); el tipo `Moneda` sale de ella.
Sumar una es agregarla ahí y sumar un caso a `tests/dominio/importe.test.ts` y
`tests/dominio/formato-importe.test.ts`: la aritmética, `convertir`, el parseo y el formato
no nombran monedas. Los montos son centavos `bigint`; nunca `number` (ADR 0018).

**...un error (F0-23).** Una entrada en `src/dominio/compartido/errores/catalogo.ts`: clave
`<PREFIJO>_NNNN` y `codigo: '<PREFIJO>-NNNN'` (tienen que coincidir, si no no compila), con el
prefijo del módulo (`DOM`, `AUT`, `ING`, `INF`, `IA`, `ALM`) y el **número siguiente al más alto
de ese prefijo**. `tipo` (`persona` · `sistema` · `externo`), `descripcion` (la ve la persona en
pantalla: sin datos del caso) y `queHacer`, completos. Después `npm run test:golden:update` y
revisá el diff de `tests/extraccion/golden/catalogo-errores.json`. **Nunca se reutiliza un
código**: una entrada no se borra ni cambia de tipo, aunque ya no se use (el test del golden lo
rechaza aun regenerando). El dominio devuelve `Resultado` con `codigo: catalogo.<CLAVE>.codigo`;
en un borde se lanza `nuevoError(catalogo.<CLAVE>, detalles, causa?)`, nunca `new Error` (ADR 0020).

**...una página que exige administrador (F0-32, ADR 0028).** Una `page.tsx` bajo
`src/app/administracion/` (o `/salud`, F0-26) empieza con `const acceso = await accesoDeAdministrador();`
(`src/app/(auth)/sesion-actual.ts`), **antes** de `armado()` o de leer ningún dato; si
`acceso.tipo === "prohibido"` devuelve `<ErrorEnPantalla error={acceso.error} />` (`src/app/_ui/`, `AUT-0003`);
si no, renderiza su contenido dentro de `<Marco>` (`src/app/_ui/marco.tsx`, F1-02: menú, cabecera con *Salir*;
recibe el email y el rol de `acceso.sesion.usuario`). No alcanza con un layout: Next no lo vuelve a renderizar al navegar. Sus acciones de escritura (Server Actions,
formularios HTML, sin `"use client"`) toman el `Actor` de `actorDesdeSesion()`, nunca de un campo del
formulario, y validan lo que llega con Zod (`src/casos-uso/usuarios/formularios.ts`, `AUT-0008`).
`tests/dominio/proteccion-administracion.test.ts` falla si una página no la llama. `/api/salud` no la usa.

**...un log (F0-24).** En `src/`, con el `log` de `src/infraestructura/log.ts` (nunca `console.*`):
`log.info({ campos }, "mensaje")`. Lo que corre dentro de `conReferencia("SRV-2026-014", fn)`
lleva `referencia` sola, también después de cada `await`: no se pasa a mano. Todo lo que sale se
redacta: el valor entero de cualquier clave que contenga `authorization`, `cookie`, `token`,
`secret`, `password` o `clave`, y en cualquier texto (mensaje, pila, valores) lo que parezca email o
CUIT. Los casos de uso no importan infraestructura: si necesitan loguear, reciben el log por
parámetro. Un campo sensible nuevo que no entre en esas reglas: a `CLAVES_SENSIBLES`, con su caso en
el test (ADR 0021).

**...un job al worker (F0-25).** Un `Job` (`{ nombre, cron, ejecutar }`) en `src/worker/jobs.ts`,
sumado a `JOBS`. Nada más: aparece solo en `/salud` (el panel lee `JOBS` y calcula su intervalo desde su `cron`; si no corrió en el doble de ese intervalo, se ve en rojo aunque su última corrida haya sido `ok`, F0-26) y el planificador lo corre a través de `registrarCorrida`, así que cada
corrida queda en `corridas_worker` (inicio antes, fin y resultado en `finally`) y, si lanza, se
loguea con su código y el planificador sigue. `ejecutar` no atrapa sus propios errores para
"seguir": que lance, con `nuevoError(catalogo.X, ...)` si tiene código propio. Lo que necesite de
afuera (repositorios, adaptadores) le llega armado desde `src/infraestructura/arranque/worker.ts`.
El test, en `tests/casos-uso/`, con la expresión cron por parámetro (`* * * * * *`, cada segundo)
para no esperar el intervalo real, y afirmando la expresión real aparte. Si el job usa un paquete
que la imagen no tiene, `npm run imagen:prueba` lo detecta (el worker no arranca). Dos réplicas del
worker correrían cada job dos veces: en Fase 0 hay una sola (ADR 0025).

**...una llamada con reintento (F0-25).** Con `conReintento(fn, politica)` de
`src/infraestructura/reintento.ts`, armado una vez con `crearConReintento({ cola, log })` (la cola
de fallidos sale de `arranque/`). `politica`: `origen` (quién falla, por ejemplo
`ingesta.correo`), `carga` (un objeto JSON con lo necesario para reintentar a mano; **nunca un
secreto**: queda en la base) y, si hace falta, `intentos` (3 por defecto) y `esperas`
(`[1000, 10000, 60000]` ms por defecto). Si agota: queda una fila en `fallidos` con el código del
último error, se loguea con `INF-0002` y **se relanza** `INF-0002`: el que llama se entera siempre.
No lo envuelvas en un `catch` que siga como si nada. En el test, pasá `esperar` en la política
para no dormir y afirmá la secuencia de esperas. El aviso al administrador sale por `avisar` (M-05, ADR 0030):
`crearConReintento({ cola, log, avisar })`, con `avisar` armado en `arranque/avisos.ts`; si `avisar`
lanza, se loguea con su código y `conReintento` relanza igual `INF-0002`.

**...un caso de uso que escribe (F0-33, ADR 0029).** Es imposible escribir sin identidad, y lo
obliga el compilador, no la disciplina:

- **`Actor` primero.** El caso de uso recibe `actor: Actor` como **primer parámetro**, sin
  valor por defecto ni sobrecarga sin actor. Su nombre empieza con uno de estos verbos:
  `crear`, `guardar`, `dar`, `revocar`, `cambiar`, `marcar`, `registrar` (seguido de mayúscula o
  nada: `darDeAlta`, `cambiarRol`). Los casos de uso son **métodos** del objeto que arma una
  fábrica (`crearCasosUso*`): las fábricas arman, no escriben, y están en la lista de excepciones
  de `tests/dominio/tipos/firmas-de-escritura.test.ts`, cada una con su porqué.
- **El repositorio también.** Los métodos de escritura de un repositorio de entidades reciben
  `actor` primero y **el adaptador escribe la auditoría** en la misma transacción
  (`RepositorioUsuarios.crear(actor, usuario)` y `.actualizar(actor, usuario, accion)`): el caso
  de uso no llama a `auditoria.registrar` para esa entidad. `RepositorioSesiones` queda fuera: una
  sesión es una credencial (ADR 0024).
- **De dónde sale el actor.** En la app, **solo** de la sesión validada: `actorDesdeSesion()` o
  `accesoDeAdministrador()` (`src/app/(auth)/sesion-actual.ts`); ningún otro archivo de `src/app/**`
  arma un actor de persona (`tipo: "persona"`) y toda Server Action pide el actor a la sesión. En el
  worker, un proceso del sistema: `{ tipo: "sistema", proceso }`, con `proceso` armado por
  `crearNombreProceso("<nombre-del-job>")` (hoy el worker no llama a ninguna escritura; cuando lo
  haga, el tipo lo obliga a pasar ese actor).
- **Qué lo rechaza si falta.** `tests/dominio/tipos/escrituras-exigen-actor.test.ts`: cada llamada
  sin actor lleva `// @ts-expect-error` y `npm run typecheck` falla (`Unused '@ts-expect-error'
  directive`) si una firma pierde el actor; **un caso de uso o un método de escritura nuevo suma su
  llamada ahí**. `firmas-de-escritura.test.ts` lista las firmas exportadas de `src/casos-uso/**` y
  exige `Actor` en la primera posición (`npm run test:dominio`), y `actor-solo-desde-la-sesion.test.ts`
  recorre `src/app/**`.

**...un ABM (F1-03, ADR 0031).** Un catálogo (listar con búsqueda, alta, edición, baja lógica) no
se escribe a mano: se **declara** y el molde da el resto. En este orden, y el compilador avisa si
falta un paso:

1. **Los datos**, una entrada en `EntidadesAbm` (`src/puertos/repositorios/abm.ts`): los campos sin
   `id` ni auditoría. Hoy un campo es `string` o `string | null`.
2. **El modelo** en `prisma/schema.prisma` con esos campos y las columnas de auditable de `Grupo`
   (`creadoEn`/`creadoPor`, `actualizadoEn`/`actualizadoPor`, `eliminadoEn`/`eliminadoPor`), y su
   migración con `down.sql` (*una migración*). **Por cada campo único, el índice va a mano en
   `migration.sql`** (Prisma no declara índices sobre expresiones, y `migrate diff` no lo cuenta como
   diferencia): `CREATE UNIQUE INDEX "<tabla>_<columna>_unico" ON "<tabla>" (lower("<columna>"))
   WHERE ("eliminado_en" IS NULL);`. Sin él, dos altas simultáneas pueden repetir el valor, y
   `tests/casos-uso/abm-indices-unicos.test.ts` queda en rojo: recorre todas las definiciones y busca
   ese índice en la base migrada (por eso el modelo se llama como la entidad).
3. **La tabla**, una línea en `src/adaptadores/prisma/abm/tablas.ts`:
   `crearRepositorioAbmPrisma(cliente, "<Entidad>", cliente.<modelo>)`. Si el modelo no coincide con
   `EntidadesAbm` o le faltan columnas de auditable, no compila.
4. **La definición**, `src/casos-uso/abm/<entidad>.ts` (copiá `grupos.ts`): entidad, nombres en
   pantalla, ruta, campos (`texto` o `textoLargo`), `validacion` (Zod; el mensaje de cada regla es el
   que ve la persona, y `.trim()` en los textos), `unicos`, `busqueda`, `orden` (la primera es el orden
   por defecto) y `rolesQueEscriben`. Y su línea en `src/casos-uso/abm/definiciones.ts`.
5. **Las pantallas**: cuatro `page.tsx` bajo `src/app/catalogo/<entidad>/` (`page.tsx`,
   `nuevo/page.tsx`, `[id]/page.tsx`, `[id]/baja/page.tsx`), copiadas de `grupos/`: cada una llama a
   `await sesionExigida()` (`src/app/(auth)/sesion-actual.ts`) **antes que nada** y le pasa la sesión y
   la definición a `PaginaListado` / `PaginaAlta` / `PaginaEdicion` / `PaginaBaja`
   (`src/app/catalogo/_abm/paginas.tsx`). `tests/dominio/proteccion-administracion.test.ts` falla si
   una no la llama. Y la entrada del menú en `SECCIONES` (`src/app/_ui/marco.tsx`).
6. **Semilla ficticia** en `prisma/seed.ts`, por el repositorio del molde (`repositorioAbmPrisma`),
   como los grupos de demostración.

No se escribe un puerto, un caso de uso, una acción ni un formulario por entidad, y **los tests del
molde no se repiten** (`tests/casos-uso/abm.test.ts`, `abm-acciones.test.ts`, `tests/e2e/grupos.spec.ts`):
un ABM nuevo prueba solo lo que tenga de propio. Un **tipo de campo** que todavía no existe (número,
fecha, opción, relación) es una variante más de `CampoAbm` (`src/casos-uso/abm/definicion.ts`), con
su conversión en `valorDeCampo` y su control en `src/app/_ui/formulario-abm.tsx`, que es el **único**
componente de cliente de `_ui/`. Los casos de uso deciden quién escribe (`AUT-0009`); las pantallas
solo ocultan los botones. Lo que la persona corrige vuelve al lado del campo (`DOM-0008`: valor único
repetido); `DOM-0009`: el registro no existe o está dado de baja. Las acciones no lanzan errores del
catálogo: vuelven al formulario con su código. Guardar sin cambios no escribe ni audita.

**...un ADR.** Archivo nuevo `docs/adr/NNNN-titulo-corto.md`, con la misma estructura que
`docs/adr/0001-excepcion-claude-md.md` y `docs/adr/0002-any-explicito-en-typecheck.md`: Contexto ·
Decisión · Alternativas descartadas · Consecuencias · Cómo se revierte. Numeración correlativa,
nunca se reutiliza, aunque el plan haya sugerido otro número para una tarea futura (el plan es una
estimación; el orden real de creación manda).

## Estructura

```
src/dominio          puro; solo importa de sí mismo. Hoy: compartido/reloj.ts (Reloj inyectable y FechaHora, F0-18); desde F0-19: compartido/identificador.ts (Identificador<Marca>, CodigoLegible, que usa el reloj para el año); compartido/historial.ts (ciclos de estado, F0-21); compartido/importe.ts (Importe<Moneda> en centavos, TipoDeCambio y parseo, F0-20); compartido/errores/ (catálogo de errores, ErrorSistema, paraPantalla/paraLog, F0-23); compartido/micro-usd.ts (costos de IA en micro-dólares, F0-28)
src/casos-uso        orquesta dominio contra puertos. Desde F0-25: salud/listar-salud.ts (listarSalud: última corrida por job con su color —rojo si nunca corrió, si terminó en error o si pasó el doble de su intervalo sin correr—, fallidos pendientes con código y edad, integraciones con su última prueba exitosa y gasto de IA del mes; nunca lanza; F0-26) y salud/hace-cuanto.ts · F0-28: ia/ (interpretar: tope, validación y registro de uso de IA; gastoDelMes) · F0-30: usuarios/ (darDeAlta, revocar, cambiarRol; F0-32: listar, formularios con Zod, roles; revocar y cambiarRol invalidan la caché de sesiones); F0-31: sesion/ (completarSesion, validarSesion con caché de 30 s, cerrarSesion, errores de pantalla; F0-32: invalidarUsuario, acceso.ts con la decisión de acceso de administrador y el actor de la sesión) · F1-03: abm/ (el molde de ABM, ADR 0031: definicion.ts, abm.ts —listar, obtener, crear, guardar, marcarEliminado—, definiciones.ts y una definición por entidad: grupos.ts)
src/puertos          interfaces. Desde F0-19: secuencias.ts, generador-id.ts; desde F0-22: auditoria.ts; desde F0-29: correo.ts, notificaciones.ts (con sus dobles en tests/contratos/); F0-30: repositorios/ (usuarios.ts, sesiones.ts, transaccion.ts) · F0-25: cola-fallidos.ts, sonda-integracion.ts, repositorios/corridas-worker.ts; F0-28: ia.ts (AdaptadorIa, AvisosIa; M-05: el aviso devuelve una promesa y no lanza) y repositorios/ (uso-ia.ts, configuracion.ts); F0-31: identidad.ts · F0-27: almacen-documentos.ts (con la validación de claves) · F1-03: repositorios/abm.ts (el puerto genérico de los ABM y `EntidadesAbm`; `RepositoriosEnTransaccion.abm` lo entrega por entidad)
src/adaptadores      implementaciones: prisma, disco, s3, identidad, dobles. Hoy: prisma/generado/ (cliente generado, sin versionar), prisma/cliente.ts (el cliente con el adaptador pg), prisma/{cola-fallidos,corridas-worker,sonda-base}.ts (F0-25), prisma/{usuarios,sesiones,auditoria,transaccion,conversiones}.ts (F0-30), prisma/{uso-ia,configuracion,fecha-hora}.ts (F0-28), prisma/abm/ (F1-03: repositorio.ts, el repositorio de cualquier ABM, y tablas.ts, qué tabla es cada entidad), ia-doble/ (doble determinista del puerto de IA, F0-28), log/notificaciones.ts (el `Notificaciones` de Fase 0: un warn con el usuarioId, M-05), identidad-falsa/ e identidad-google/ (F0-31) y memoria/ (F0-19: secuencias.ts, generador-id.ts; F0-22: auditoria.ts; F0-29: correo.ts, notificaciones.ts), disco/ y s3/ (F0-27: el almacén de documentos)
src/infraestructura  entorno.ts (Zod) · version.ts · log.ts (pino, redacción, referencia; F0-24) · proceso.ts (excepciones no capturadas → INF-0001 y salida 1) · fallas.ts y reintento.ts (conReintento, F0-25) · arranque/ = punto de armado (worker.ts desde F0-25; avisos.ts —los avisos al administrador por `Notificaciones`, M-05—, armado.ts e identidad.ts, que elige el adaptador según `IDENTIDAD`, desde F0-31; desde F0-27: almacen.ts, que elige disco o s3 según ALMACEN y arma nuevaClaveDocumento con el reloj real; salud.ts —el panel armado con la lista de `JOBS` del worker— e intervalo-cron.ts, desde F0-26)
src/app              Next.js (App Router): página de inicio, layout raíz, api/salud, (auth)/ (F0-31: login, callback, salir, sesión), administracion/ (F0-32: inicio y usuarios, protegidos por rol), salud/ (F0-26: el panel `/salud`, HTML del servidor sin JavaScript de cliente, protegido por rol de administrador) · _ui/ (F1-02: el marco, la tarjeta y los componentes —botón, campo, selector, tabla, error en pantalla— de las pantallas: HTML del servidor, sin `"use client"`; F1-03: `ListadoAbm` y `FormularioAbm`, este último el único de cliente) · catalogo/ (F1-03: _abm/ —las cuatro pantallas y las acciones de cualquier ABM— y una carpeta por entidad: grupos/) · formato/importe.ts (USD 24.315,00, F0-20)
src/instrumentation.ts  lo levanta Next al arrancar: valida el entorno. Cuenta como app
src/worker           proceso aparte (F0-25): index.ts (entrada, `npm run worker`) · planificador.ts (croner) · registrar-corrida.ts · jobs.ts (latido)
tests/               los cuatro niveles (ver *Testing*): dominio (con _arnes/sin-red.ts) · casos-uso (_arnes/: un Postgres para toda la tanda; minio.ts, MinIO para el almacén S3) · extraccion (_arnes/golden.ts) · e2e (Playwright, _arnes/apagar-app.ts) · contratos · fixtures
scripts/             utilidades de los comandos de package.json (sin-any.ts, sin-error-crudo.ts, sin-marcas-conflicto.ts, db-migrate-down.ts, db-seed.ts, test-dominio.ts, e2e-app.ts; lib/migraciones.ts)
next.config.ts       configuración de Next: standalone, versión del build, agentRules
vitest.config.ts     los tres niveles que corren con Vitest (proyectos dominio, casos-uso, extraccion)
playwright.config.ts el nivel e2e: Chromium y el webServer que levanta la app con compose
prisma/              schema.prisma · migrations/<marca>_<nombre>/{migration.sql, down.sql} · seed.ts (el mecanismo, F0-10; el primer administrador, F0-30; los grupos de demostración, F1-03)
prisma.config.ts     configuración de la CLI de Prisma: rutas y DATABASE_URL
docker-compose.yml   servicios locales: Postgres 16, MinIO y minio-init (el bucket; F0-27) y, detrás de perfiles, la app para el e2e (`e2e`) y el worker (`worker`, F0-25)
Dockerfile           imagen multi-stage de la app y del worker (F0-25: otro comando, misma imagen) · .dockerignore
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
