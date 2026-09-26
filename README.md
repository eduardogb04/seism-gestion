# seism-gestion

Sistema de gestión de operaciones para una consultora de servicios a la minería. En construcción:
Fase 0 (cimientos).

Repositorio **público**. No contiene datos reales ni documentos de negocio: ver `AGENTS.md`,
regla 1.

## Estado

Lote 2, tarea F0-08: esqueleto del proyecto (TypeScript severo, scripts base), Biome como formato
y lint, dependency-cruiser con los límites de arquitectura, Next.js mínimo (una página, el latido
`GET /api/salud` y el entorno validado al arrancar), CI (el check `ci` de GitHub Actions corre
todos los chequeos y gitleaks en cada push y cada PR, `.github/workflows/ci.yml`), imagen Docker
publicada en GHCR, y la base: Postgres 16 local con Docker Compose y Prisma con la primera
migración (la tabla `configuracion`). La app todavía no usa la base (ver `docs/adr/` para las
decisiones ya tomadas).

## Cómo se levanta (hoy)

Requiere Node 24 (ver `.nvmrc`), git (la versión del build es el SHA corto del commit) y Docker
corriendo para la base (en Windows, con WSL: `RUNBOOK.md`, sección 1).

```
npm install                  # también genera el cliente de Prisma (no necesita base)
cp .env.example .env         # en cmd de Windows: copy .env.example .env
docker compose up -d --wait  # Postgres 16 local, sano
npm run db:migrate           # aplica las migraciones
npm run dev                  # http://localhost:3000 y http://localhost:3000/api/salud
```

**Sin `.env` la app no arranca, a propósito:** el entorno se valida al levantar el servidor y, si
falta una variable o es inválida, el proceso termina y dice cuál. Lo mismo `npm run db:migrate`.
`.env.example` no tiene secretos: `APP_ENTORNO=local` y la `DATABASE_URL` del Postgres local de
`docker-compose.yml`, con credenciales ficticias de desarrollo. `.env` nunca entra al repo. Cómo se
cambia el esquema: `docs/convenciones-base.md`.

Los chequeos:

```
npm test           # Vitest: niveles dominio y casos de uso (necesita Docker)
npm run test:e2e   # Playwright: la app levantada con compose, en Chromium
npm run test:todo  # los cuatro niveles (dominio, casos de uso, extracción, e2e)
npm run typecheck  # tsc --noEmit + rechazo de 'any' explícito
npm run lint       # Biome: lint + formato en modo verificación
npm run limites    # dependency-cruiser: qué capa puede importar a cuál
npm run build      # next build (standalone); no necesita .env
```

El servidor de producción, después del build: `node .next/standalone/server.js` con `APP_ENTORNO`
y `DATABASE_URL` en el entorno del proceso. Ojo: si al compilar había un `.env`, `next build` lo
copia a `.next/standalone/` y ese servidor lo lee.

## Con Docker

Requiere Docker corriendo. No hace falta `npm install`: la app se compila adentro de la imagen.

```
npm run imagen          # construye seism-gestion:local (multi-stage, no root)
npm run imagen:prueba   # la levanta y verifica /, /api/salud, que no lleve .env y el tamaño
docker run --rm -p 3000:3000 -e APP_ENTORNO=local -e DATABASE_URL=postgresql://prueba:prueba@127.0.0.1:5432/prueba -e ALMACEN=disco -e ALMACEN_DIRECTORIO=/tmp/almacen seism-gestion:local
```

La imagen de cada commit de `main` se publica sola en
`ghcr.io/eduardogb04/seism-gestion` (etiquetas: el SHA del commit y `latest`); es pública, se baja
sin credenciales. Sin `APP_ENTORNO` o sin `DATABASE_URL` el contenedor no arranca, igual que la
app: el entorno se valida al levantar (la app todavía no se conecta a la base, así que alcanza una
URL ficticia como la de arriba). Detalle en `docs/adr/0007-imagen-docker.md`; los pasos manuales de GitHub, en
`RUNBOOK.md` (secciones 14 y 15).

## Dónde está todo

Ver `AGENTS.md` — es la puerta de entrada, para personas y para agentes. Resumen de la estructura:

```
src/      dominio · casos-uso · puertos · adaptadores · infraestructura · app (Next.js) · worker
tests/    dominio · casos-uso · extraccion · e2e · contratos · fixtures
scripts/  utilidades de los comandos de package.json
prisma/   schema.prisma · migrations/ (cada una con migration.sql y down.sql)
docs/     arquitectura.md (capas y límites) · convenciones-base.md (migraciones) · adr/ · ensayos/
infra/    oracle/bootstrap.sh (levanta la instancia del ensayo, F0-12)
.github/  workflows/ci.yml (CI y publicación) · CODEOWNERS · dependabot.yml
Dockerfile · .dockerignore   la imagen de la app
docker-compose.yml           Postgres 16 local
```

Cada carpeta de `src/` y `tests/` tiene su propio `README.md`.

## Documentos

- `AGENTS.md` — instrucciones para agentes y personas: comandos, reglas no negociables, cómo se
  trabaja.
- `docs/arquitectura.md` — capas, carpetas y qué puede importar cada una.
- `RUNBOOK.md` — pasos manuales de infraestructura, con verificación.
- `docs/adr/` — decisiones de arquitectura, una por archivo, con alternativas descartadas.
- `LICENSE` — derechos reservados: público no es libre.
- `SECURITY.md` — cómo reportar una vulnerabilidad o un dato que no debería estar acá.
