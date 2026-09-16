# ADR 0010 — Los cuatro niveles de test: tres proyectos de Vitest y un Playwright

> Archivo: `docs/adr/0010-niveles-de-test.md`. Numeración correlativa, nunca se reutiliza.
> Un ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se
> marca *Reemplazado por NNNN*.

**Fecha:** 2026-09-15
**Estado:** Propuesto
**Tarea:** F0-14
**Decide:** el plan (F0-14 y cimiento 4) fija los cuatro niveles, el tope de 10 s del dominio, el
contenedor único de casos de uso y el camino de humo con Playwright; el dev resuelve las tres
partes que el plan no podía fijar sin ver las herramientas instaladas (con qué corredor corre el
e2e, cómo se comparte un contenedor entre archivos de test, y quién mide el tope de 10 s)

## Contexto

Hasta F0-11 había una sola tanda de Vitest con dos carpetas (`tests/dominio/` y
`tests/casos-uso/`), cada test de casos de uso levantando **su propio** Postgres con
Testcontainers, y ningún nivel e2e. F0-14 pide separar los cuatro niveles con configuración
propia, que el dominio no pueda salir a la red, que los casos de uso compartan un solo contenedor
con base limpia por test, y un camino de humo con Playwright contra la app levantada con compose.

El criterio del plan dice literalmente *"Vitest con cuatro proyectos: …`e2e` (Playwright)"*, y en
*Qué toca* nombra `playwright.config.ts` y `tests/e2e/humo.spec.ts`. Las dos cosas juntas no se
pueden: un `.spec.ts` de Playwright lo ejecuta **el corredor de Playwright**, que trae su propio
`test`/`expect`, sus *fixtures* (`page`, `request`), su `webServer` y su instalación de
navegadores. Vitest no lo puede correr.

## Decisión

**Cuatro niveles, cada uno con su configuración; tres son proyectos de Vitest y el cuarto es
Playwright.**

| Nivel | Corredor | Configuración | Qué necesita |
|---|---|---|---|
| `dominio` | Vitest (proyecto) | `vitest.config.ts` + `tests/dominio/_arnes/sin-red.ts` | nada |
| `casos-uso` | Vitest (proyecto) | `vitest.config.ts` + `tests/casos-uso/_arnes/` | Docker |
| `extraccion` | Vitest (proyecto) | `vitest.config.ts` | nada |
| `e2e` | Playwright | `playwright.config.ts` + `tests/e2e/_arnes/` | Docker y Chromium |

Lo demás que fija esta decisión:

1. **El dominio no tiene red.** `setupFiles` carga `tests/dominio/_arnes/sin-red.ts`, que
   reemplaza `Socket.prototype.connect` (`node:net`, por donde salen todas las conexiones TCP de
   Node: `pg`, Prisma, cualquier cliente HTTP) y `globalThis.fetch` por dos funciones que tiran
   `ErrorSinRed`. `tests/dominio/_arnes/sin-red.test.ts` intenta las tres salidas y espera ese
   error: si alguien saca el arnés, el nivel se pone en rojo.
2. **Un solo Postgres por corrida en casos de uso.** Lo levanta un `globalSetup`
   (`tests/casos-uso/_arnes/contenedor.ts`), que además crea adentro la base compartida y le
   aplica las migraciones una vez; los tests la reciben por `provide`/`inject` y la vacían con
   `limpiarBase()` (un `TRUNCATE` de todas las tablas de la aplicación, sin nombrar ninguna) en su
   `beforeEach`. El test que necesita una base **sin migrar** (F0-09) se crea la suya con
   `crearBaseVacia()` adentro del mismo contenedor. Los archivos corren de a uno
   (`fileParallelism: false`) porque comparten esa base.
3. **El tope de 10 s del dominio lo mide un script.** `npm run test:dominio`
   (`scripts/test-dominio.ts`) corre el proyecto `dominio`, mide la corrida entera y sale 1 si se
   pasó de 10 s. Es un paso propio de `ci.yml`.
4. **El e2e levanta la app con compose.** El servicio `app` de `docker-compose.yml` vive detrás
   del perfil `e2e` (no lo levanta `docker compose up -d`) y corre **la imagen que se publica**
   (`seism-gestion:local`, la de F0-07), no `next dev`. Lo levanta el `webServer` de Playwright
   (`npm run e2e:app`) y lo apaga el `globalTeardown`, que borra solo ese contenedor: el Postgres
   de compose y su volumen no se tocan.
5. **En CI todo va adentro del check `ci`.** No hay job nuevo: el *ruleset* de `main` exige ese
   check y nada más (F0-06). El e2e corre después del paso `imagen`, que es el que deja construida
   la imagen que levanta compose.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un cuarto proyecto de Vitest que maneje Chromium con la librería `playwright` (sin `@playwright/test`) | Cumpliría la letra del criterio y ninguna de sus tres partes concretas: no hay `webServer` (habría que levantar y apagar la app a mano en cada archivo), ni `projects` de navegador, ni trazas, ni `npx playwright install`. Más código propio para tener menos |
| El modo navegador de Vitest (`vitest --browser`, que usa Playwright por dentro) | Está pensado para probar componentes dentro del navegador, no para recorrer una app servida de verdad; y el criterio pide `webServer` contra la app levantada con compose |
| Que cada test de casos de uso siga levantando su contenedor (lo de F0-09 y F0-10) | Es lo que la tarea viene a corregir: con dos archivos ya se levantaban dos Postgres, y la cuenta sube con cada test nuevo |
| Un contenedor por archivo pero reusado con `withReuse()` de Testcontainers | Deja contenedores vivos entre corridas a propósito: choca con "no dejan estado entre corridas, y se destruyen al terminar" |
| Que el `globalSetup` pase el objeto del contenedor a los tests | `provide`/`inject` serializa: el objeto no cruza de proceso. Los tests llegan al contenedor por su id, con el cliente de Testcontainers (`getContainerRuntimeClient`), que es lo que la propia librería usa por dentro |
| Recrear la base compartida por test en vez de `TRUNCATE` | `create database` tarda cientos de milisegundos y hay que volver a migrar; `TRUNCATE` de todas las tablas tarda milisegundos y es lo que pide el criterio |
| Medir el tope de 10 s del dominio con un reportero propio de Vitest o desde el `globalSetup` | El cierre de un `globalSetup` corre al final de **toda** la tanda (dominio y casos de uso juntos en `npm test`): mediría el contenedor de Postgres como si fuera tiempo del dominio |
| Que el e2e levante `next dev` o `node .next/standalone/server.js` en vez de compose | El plan pide compose, y probar la imagen que se despliega es más parecido a producción que probar el servidor de desarrollo |
| Un job `e2e` aparte en `ci.yml` | El único check exigido por el *ruleset* de `main` es `ci`: un job aparte no bloquearía un merge (F0-06) |

## Consecuencias

- Se gana: un test de dominio ya no puede "irse a la red" sin que se note; la tanda de casos de uso
  levanta **un** Postgres en vez de uno por archivo; el e2e prueba la imagen que se publica, con
  navegador, en cada cambio; y cada nivel se corre solo (`--project`) cuando se lo necesita.
- Se pierde: `npm run test:e2e` necesita Docker **y** el navegador instalado
  (`npx playwright install chromium`, RUNBOOK sección 16), y suma minutos a CI (el paso que
  instala Chromium más la corrida; el tope de P9 sigue siendo 10 minutos de punta a punta).
- Los archivos de casos de uso ya no corren en paralelo entre sí: comparten la base. Si algún día
  molesta, la salida es una base por archivo adentro del mismo contenedor (el arnés ya sabe
  crearlas), no un contenedor más.
- Quién lo hace cumplir: el arnés de red (un test), el tope de 10 s (un script en CI), los cuatro
  niveles (pasos de `ci.yml`: `test:dominio`, `test`, `test:e2e`).

## Cómo se revierte

Los niveles viven en dos archivos de configuración y dos carpetas de arnés. Sacar el e2e es borrar
`playwright.config.ts`, `tests/e2e/`, el servicio `app` de compose, los dos scripts y los dos pasos
de `ci.yml`; volver a una sola tanda de Vitest es dejar un `include` en vez de `projects`. Ningún
código de `src/` depende de esta decisión.
