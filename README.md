# seism-gestion

Sistema de gestión de operaciones para una consultora de servicios a la minería. En construcción:
Fase 0 (cimientos).

Repositorio **público**. No contiene datos reales ni documentos de negocio: ver `AGENTS.md`,
regla 1.

## Estado

Lote 0, tarea F0-02: esqueleto del proyecto (TypeScript severo, scripts base, un test de humo) más
Biome como formato y lint. Todavía no hay Next.js, ni límites de arquitectura, ni base de datos, ni
CI: llegan en las tareas siguientes del plan (ver `Kickoff/ESTADO.md` fuera de este repo, o
`docs/adr/` para las decisiones ya tomadas).

## Cómo se levanta (hoy)

Requiere Node 24 (ver `.nvmrc`).

```
npm install
npm test           # Vitest, nivel dominio
npm run typecheck  # tsc --noEmit + rechazo de 'any' explícito
npm run lint       # Biome: lint + formato en modo verificación
```

`npm run dev` y `npm run build` existen pero todavía no hacen nada real (avisan qué tarea los
trae). `npm run db:migrate` sale en error hasta que exista esquema (lote 2).

## Dónde está todo

Ver `AGENTS.md` — es la puerta de entrada, para personas y para agentes. Resumen de la estructura:

```
src/      dominio · casos-uso · puertos · adaptadores · infraestructura · app · worker
tests/    dominio · casos-uso · extraccion · e2e · contratos · fixtures
scripts/  utilidades de los comandos de package.json
docs/     adr/ (decisiones de arquitectura)
```

Cada carpeta de `src/` y `tests/` tiene su propio `README.md`.

## Documentos

- `AGENTS.md` — instrucciones para agentes y personas: comandos, reglas no negociables, cómo se
  trabaja.
- `RUNBOOK.md` — pasos manuales de infraestructura, con verificación.
- `docs/adr/` — decisiones de arquitectura, una por archivo, con alternativas descartadas.
- `LICENSE` — derechos reservados: público no es libre.
- `SECURITY.md` — cómo reportar una vulnerabilidad o un dato que no debería estar acá.
