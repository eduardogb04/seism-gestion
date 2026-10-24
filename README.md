# seism-gestion

Sistema de gestión de operaciones para una consultora de servicios a la minería: lleva cada
servicio desde que se cotiza hasta que se cobra, con sus documentos, sus ingresos y sus egresos.
Monolito modular en TypeScript: Next.js, PostgreSQL y Prisma, con un worker aparte para tareas
programadas. Lo construyen agentes; una persona con criterio de negocio valida cada tanda.

Repositorio **público**. No contiene datos reales ni documentos de negocio: todo lo que se ve
(clientes, montos, personas) es inventado. Ver `AGENTS.md`, regla 1.

## Estado

En construcción. Cerradas: Fase 0 (cimientos), F1 (catálogos con un molde de ABM y el front base)
y F2 (finanzas). En curso: F3 (el servicio de punta a punta, del recorrido por etapas al inicio
con KPI). Corre solo en local: todavía no hay servidor.

Este README y la descripción del repo se actualizan **al cerrar cada tanda** (F1, F2, F3...), no
con cada tarea: entre un cierre y otro, `main` puede traer más de lo que dice acá.

## Qué hace hoy

- **Entrar:** identidad delegada en Google (en local, una pantalla de usuarios de prueba), con
  sesiones y roles; nadie escribe sin identidad (ADR 0027 y 0029).
- **Catálogo** (`/catalogo`): clientes y grupos de clientes, sitios, camiones, tipos de servicio,
  centros de costo y cuentas. Todos salen del mismo molde de ABM, con baja lógica (ADR 0031).
- **Servicios** (`/servicios`): el recorrido por etapas (cotizado → adjudicado → en ejecución →
  finalizado), con responsable, hitos y recursos, documentos adjuntos, órdenes de compra y
  facturas con su tipo de cambio, y cobros. Hay listados de facturas, de lo que falta cobrar y de
  lo cobrado (ADR 0033 a 0037 y 0039).
- **Egresos** (`/egresos`): gastos imputados a un centro de costo y a un servicio, lo que falta
  pagar y lo pagado.
- **Inicio** (`/`): cuánto entra y cuánto sale en el mes, cada moneda por su lado, y cada número
  enlaza a su listado (ADR 0038).
- **Administración** (`/administracion`, `/salud`): usuarios y roles, y el panel de salud del
  sistema (la base, el worker, los avisos al administrador).
- Tema claro, oscuro o el del sistema operativo, con barra lateral e íconos (ADR 0040).

Por dentro: errores con código en un catálogo, logs estructurados, importes y fechas con tipos
propios, historial de estados, almacén de documentos en disco o S3, la IA detrás de un puerto, y
migraciones que se aplican y se revierten. Cada decisión está en `docs/adr/`.

## Cómo se levanta

Requiere Node 24 (ver `.nvmrc`), git y Docker Desktop abierto (en Windows, con WSL: `RUNBOOK.md`,
sección 1).

```
npm ci
npm run arrancar     # .env, Postgres, migraciones, semilla de demostración y next dev
```

Deja la app en `http://localhost:3000` e imprime con qué email de prueba entrar. Se puede correr
de nuevo cuando quieras: no duplica la semilla. Los pasos sueltos (`docker compose up -d --wait`,
`npm run db:migrate`, `npm run db:seed`, `npm run dev`) y qué hace cada uno: `RUNBOOK.md`.

**Sin `.env` la app no arranca, a propósito:** el entorno se valida al levantar y, si falta una
variable o es inválida, el proceso termina y dice cuál. `.env.example` no tiene secretos: sus
credenciales son las del Postgres local, ficticias. `.env` nunca entra al repo.

## Los chequeos

```
npm run verificar  # todo lo del check `ci`, en orden
npm test           # Vitest: niveles dominio y casos de uso (necesita Docker)
npm run test:e2e   # Playwright: la imagen de la app levantada con compose, en Chromium
npm run typecheck  # tsc --noEmit + rechazo de 'any' explícito
npm run lint       # Biome, más los controles propios (errores crudos, marcas de conflicto)
npm run limites    # dependency-cruiser: qué capa puede importar a cuál
npm run build      # next build (standalone); no necesita .env
```

El check `ci` de GitHub Actions corre todo esto (más gitleaks y el control de drift del esquema)
en cada push y cada PR; `main` solo acepta PR con `ci` en verde. Detalle en `AGENTS.md`, *CI*.

## Con Docker

```
npm run imagen          # construye seism-gestion:local (multi-stage, no root)
npm run imagen:prueba   # la levanta y verifica /, /api/salud, que no lleve .env y el tamaño
```

La imagen de cada commit de `main` se publica en `ghcr.io/eduardogb04/seism-gestion` (etiquetas:
el SHA del commit y `latest`). Detalle en `docs/adr/0007-imagen-docker.md` y `RUNBOOK.md`
(secciones 14 y 15).

## Dónde está todo

Ver `AGENTS.md`: es la puerta de entrada, para personas y para agentes. Resumen de la estructura:

```
src/      dominio · casos-uso · puertos · adaptadores · infraestructura · app (Next.js) · worker
tests/    dominio · casos-uso · extraccion · e2e · contratos · fixtures
scripts/  utilidades de los comandos de package.json
prisma/   schema.prisma · migrations/ (cada una con migration.sql y down.sql) · semillas
docs/     arquitectura.md (capas y límites) · convenciones-base.md (migraciones) · adr/ · ensayos/
infra/    oracle/bootstrap.sh (el script del servidor del ensayo, F0-12)
.github/  workflows/ci.yml (CI y publicación) · CODEOWNERS · dependabot.yml
Dockerfile · .dockerignore   la imagen de la app
docker-compose.yml           Postgres 16 y MinIO locales; la app y el worker, detrás de perfiles
```

Cada carpeta de `src/` y `tests/` tiene su propio `README.md`.

## Documentos

- `AGENTS.md`: instrucciones para agentes y personas: comandos, reglas no negociables, cómo se
  trabaja.
- `docs/arquitectura.md`: capas, carpetas y qué puede importar cada una.
- `RUNBOOK.md`: pasos manuales, con verificación.
- `docs/adr/`: decisiones de arquitectura, una por archivo, con alternativas descartadas.
- `LICENSE`: derechos reservados: público no es libre.
- `SECURITY.md`: cómo reportar una vulnerabilidad o un dato que no debería estar acá.
