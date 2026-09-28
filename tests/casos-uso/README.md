# tests/casos-uso

Tests con Postgres real en contenedor (Testcontainers). Necesitan Docker
corriendo (RUNBOOK, sección 1).

**Un solo contenedor para toda la tanda** (F0-14): lo levanta el `globalSetup`
del proyecto `casos-uso` de Vitest (`_arnes/contenedor.ts`), que además deja
migrada la base compartida. Los tests la reciben con `_arnes/base.ts`:

- `uriBaseCompartida()` — la base ya migrada.
- `limpiarBase()` — `TRUNCATE` de todas las tablas de la aplicación. Va en el
  `beforeEach`: **base limpia por test**, sin levantar un contenedor nuevo.
- `crearBaseVacia(nombre)` — una base sin migrar, adentro del mismo contenedor,
  para el test que necesita partir de cero.
- `psqlEn(base)` — `psql` adentro del contenedor.

Los archivos corren de a uno (`fileParallelism: false`): comparten esa base.
Nada sobrevive a la corrida (los datos van en `tmpfs` y el contenedor se para
al terminar).

- `_arnes/base-limpia.test.ts` (F0-14): el arnés probado con sus propias
  reglas — un test escribe, el siguiente ve la base vacía.
- `migraciones.test.ts` (F0-09): aplica la cadena entera de
  `prisma/migrations/`, compara con `schema.prisma` y la revierte entera.
- `migraciones-completas.test.ts` (F0-11): cada migración tiene su `down.sql`
  (sin Docker).
- `seed.test.ts` (F0-10): `sembrar` dos veces deja la base igual.
- `worker.test.ts` (F0-25): registro de cada corrida, planificador vivo
  después de un job que lanza, `latido` cada 5 minutos, y el proceso
  (`node src/worker/index.ts`) sin `DATABASE_URL` no arranca y con ella sí.
- `reintento.test.ts` (F0-25): `conReintento` con esperas inyectadas; si
  agota, fila en `fallidos`, log con `INF-0002` y el error relanzado.
- `salud.test.ts` (F0-25): `listarSalud` con la base real, con una sonda que
  lanza y con la base caída (nunca lanza).
