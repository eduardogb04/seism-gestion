# tests/casos-uso

Tests con Postgres real en contenedor (Testcontainers). Necesitan Docker
corriendo (RUNBOOK, sección 1).

- `migraciones.test.ts` (F0-09): aplica la cadena entera de
  `prisma/migrations/`, compara con `schema.prisma` y la revierte entera.
