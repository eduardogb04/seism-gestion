# seism-gestion

Sistema de gestión de operaciones para una consultora de servicios a la minería. En construcción:
Fase 0 (cimientos).

Repositorio **público**. No contiene datos reales ni documentos de negocio: ver `AGENTS.md`,
regla 1.

## Estado

Lote 0, tarea F0-04: esqueleto del proyecto (TypeScript severo, scripts base), Biome como formato
y lint, dependency-cruiser con los límites de arquitectura, y Next.js mínimo: una página, el
latido `GET /api/salud` y el entorno validado al arrancar. Todavía no hay base de datos ni CI:
llegan en las tareas siguientes del plan (ver `docs/adr/` para las decisiones ya tomadas).

## Cómo se levanta (hoy)

Requiere Node 24 (ver `.nvmrc`) y git (la versión del build es el SHA corto del commit).

```
npm install
cp .env.example .env   # en cmd de Windows: copy .env.example .env
npm run dev            # http://localhost:3000 y http://localhost:3000/api/salud
```

**Sin `.env` la app no arranca, a propósito:** el entorno se valida al levantar el servidor y, si
falta una variable o es inválida, el proceso termina y dice cuál. `.env.example` no tiene
secretos (hoy solo `APP_ENTORNO=local`). `.env` nunca entra al repo.

Los chequeos:

```
npm test           # Vitest, nivel dominio
npm run typecheck  # tsc --noEmit + rechazo de 'any' explícito
npm run lint       # Biome: lint + formato en modo verificación
npm run limites    # dependency-cruiser: qué capa puede importar a cuál
npm run build      # next build (standalone); no necesita .env
```

El servidor de producción, después del build: `APP_ENTORNO=local node .next/standalone/server.js`.
Ojo: si al compilar había un `.env`, `next build` lo copia a `.next/standalone/` y ese servidor lo
lee. `npm run db:migrate` sale en error hasta que exista esquema (lote 2).

## Dónde está todo

Ver `AGENTS.md` — es la puerta de entrada, para personas y para agentes. Resumen de la estructura:

```
src/      dominio · casos-uso · puertos · adaptadores · infraestructura · app (Next.js) · worker
tests/    dominio · casos-uso · extraccion · e2e · contratos · fixtures
scripts/  utilidades de los comandos de package.json
docs/     arquitectura.md (capas y límites) · adr/ (decisiones de arquitectura)
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
