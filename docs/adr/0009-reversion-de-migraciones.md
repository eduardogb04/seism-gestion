# ADR 0009 — Reversión de migraciones: `db:migrate:down` y el test de la cadena entera

> Archivo: `docs/adr/0009-reversion-de-migraciones.md`. Numeración correlativa, nunca se reutiliza.
> Un ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se
> marca *Reemplazado por NNNN*. Completa el ADR 0008 (punto 6, *Reversión*), no lo reemplaza.

**Fecha:** 2026-09-14
**Estado:** Propuesto
**Tarea:** F0-09
**Decide:** el plan (P1: `down.sql` por migración, `db:migrate:down`, test que aplica y revierte
la cadena entera) y el orquestador de Fase 0 (borrar la fila de `_prisma_migrations`, sin driver de
Postgres, Testcontainers en la tanda normal de `npm test`); el resto, el dev de F0-09

## Contexto

F0-08 dejó cada migración con su `down.sql` y la reversión verificada a mano. P1 pide dos cosas
más: un script que revierta la última migración aplicada y un test que aplique la cadena entera
contra un Postgres de verdad, la compare con `schema.prisma` y la revierta entera. Prisma no trae
nada de eso: solo migra hacia adelante, y su CLI puede **ejecutar** SQL (`prisma db execute`) pero
no **devolver filas**, que hace falta para saber cuál es la última migración aplicada. El driver de
Postgres (`pg` + `@prisma/adapter-pg`) está previsto recién para F0-10.

## Decisión

**Un módulo compartido (`scripts/lib/migraciones.ts`) que revierte con `psql` adentro del
contenedor de Postgres. Lo usan el script, contra compose, y el test, contra un Postgres efímero de
Testcontainers: los dos revierten con el mismo SQL.**

1. **Sin driver: `psql` del contenedor.** La imagen de Postgres trae `psql`. El módulo recibe un
   `EjecutarPsql` (corre un script SQL y devuelve código, salida y error) y no sabe quién lo
   invoca: `db:migrate:down` usa `docker compose exec -T postgres psql`, el test usa el `exec` de
   Testcontainers. Las opciones de `psql` son las mismas en los dos lados (`OPCIONES_PSQL`: sin
   `.psqlrc`, `ON_ERROR_STOP`, salida pelada).
2. **Revertir = `down.sql` + borrar la fila, en una transacción.** El SQL de una reversión es
   `begin;` + el `down.sql` + `delete from _prisma_migrations where migration_name = '<nombre>';` +
   `commit;`. Si algo falla, `psql` corta y nada se confirma: la base queda como estaba. Sin borrar
   la fila, `prisma migrate deploy` daría la migración por aplicada y no la volvería a correr (aviso
   de F0-08). Consecuencia: **un `down.sql` no lleva `BEGIN` ni `COMMIT` propios**. El nombre va
   literal en el `delete`, así que solo se acepta la forma que escribe Prisma
   (`<14 dígitos>_<minúsculas, dígitos y _>`).
3. **"La última aplicada"** = la de nombre más alto en `_prisma_migrations` entre las terminadas
   (`finished_at` no nulo) y no marcadas como revertidas. Los nombres empiezan con la marca de
   tiempo y `migrate deploy` las aplica en ese orden. Si `_prisma_migrations` no existe (base nunca
   migrada), no hay ninguna. Si la base tiene aplicada una migración que no está en
   `prisma/migrations/` o no tiene `down.sql`, no se toca nada y sale 1 diciéndolo.
4. **`npm run db:migrate:down` (`scripts/db-migrate-down.ts`)**: valida el entorno con el mismo
   esquema Zod que `db:migrate`, **solo corre contra la base local** (si el host de `DATABASE_URL`
   no es `localhost`, `127.0.0.1` o `[::1]`, sale 1 sin ejecutar nada: en el servidor no se revierte
   con este script) y revierte **una** migración por corrida. La URL le llega a `psql` por el
   entorno del `exec`, no por los argumentos. Sale 0 si revirtió; 1 si no había migraciones
   aplicadas (con ese mensaje), si falla el entorno o si falla la reversión.
5. **`_prisma_migrations` queda, vacía.** Es el registro de Prisma, no una tabla propia: la crea
   `prisma migrate` y ningún `down.sql` la borra. Revertir la cadena entera la deja **sin filas**
   (cada reversión borra la suya), y así se puede volver a aplicar todo. "Base vacía" en el test =
   ninguna tabla fuera de los esquemas del sistema salvo `_prisma_migrations` **y** `prisma migrate
   diff --from-config-datasource --to-empty --exit-code` vacío (ese diff ignora `_prisma_migrations`
   y ve también tipos, secuencias e índices que un `down.sql` incompleto dejara sueltos).
6. **El test (`tests/casos-uso/migraciones.test.ts`).**
   - `@testcontainers/postgresql` fijado exacto en **12.1.0** (trae `testcontainers` 12.1.0), en
     `devDependencies`. Pide Node `>= 22.22`.
   - **La misma imagen que compose**: la lee de `docker-compose.yml` (tag y digest). Subir la de
     compose sube la del test, sin tocarlo.
   - Datos del Postgres en `tmpfs` (nada a disco ni volúmenes anónimos), `afterAll` para y borra el
     contenedor, y Ryuk, el recolector de Testcontainers, lo borra si el proceso muere antes. Ryuk se
     deja prendido: es la red para una corrida cortada.
   - Recorre `prisma/migrations/` (cada subcarpeta con `migration.sql`, en orden de nombre): no nombra
     ninguna migración. Exige `down.sql` en todas. Aplica con `prisma migrate deploy` (lo mismo que
     `db:migrate` y que el `migrador` del servidor, P12) y exige que `_prisma_migrations` las tenga
     todas, en ese orden. `prisma migrate diff --from-config-datasource --to-schema
     prisma/schema.prisma --exit-code` tiene que dar vacío. Revierte con `revertirUltimaMigracion`
     tantas veces como migraciones haya y exige que salgan en orden inverso. Verifica la base vacía
     (punto 5), que no quede nada por revertir, y vuelve a aplicar la cadena entera.
   - Entra en la tanda normal de `npm test` (`vitest.config.ts` incluye `tests/casos-uso/`), así
     que **`npm test` necesita Docker corriendo**. La separación en niveles es F0-14.
   - CI no necesitó ningún paso nuevo: el runner `ubuntu-24.04` trae Docker y Testcontainers lo
     encuentra solo. En Windows lo encuentra por el named pipe de Docker Desktop, sin configurar
     nada.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Driver de Postgres (`pg`) para leer `_prisma_migrations` | Dependencia nueva antes de que haga falta para la app (F0-10). `psql` ya está en la imagen |
| `prisma db execute` para todo | Ejecuta pero no devuelve filas: no sirve para saber cuál es la última aplicada |
| Deducir la última aplicada de la salida de `prisma migrate status` | Texto para humanos, sin formato estable: se rompe con cualquier versión de Prisma |
| Que el `down.sql` borre su fila de `_prisma_migrations` | Descartado en el ADR 0008: mezcla esquema con la contabilidad de Prisma |
| `down.sql` y borrado en dos pasos separados | Si el segundo falla, la base queda revertida pero registrada como aplicada, y `db:migrate` no la repone |
| `db:migrate:down` contra cualquier `DATABASE_URL` | Revertir borra datos. En el servidor las migraciones las corre el `migrador` (P12), hacia adelante. Si alguna vez hace falta revertir allá, es otra decisión, con su ADR |
| `psql` desde un contenedor aparte (`docker run --network host`) contra cualquier URL | En Docker Desktop (Windows) la red `host` no es la de la máquina. Y el criterio es la base de compose |
| Borrar `_prisma_migrations` al revertir la última | La tabla es de Prisma. Vacía no molesta, y `migrate deploy` la reutiliza |
| `postgres:16` en el test, independiente de compose | Dos imágenes que se desincronizan. El test tiene que probar la misma base que se usa en local |
| Ryuk apagado (`TESTCONTAINERS_RYUK_DISABLED`) | Si la corrida se corta, los contenedores quedan vivos |
| Un contenedor por paso (varios `test` independientes) | Cada paso depende del anterior: partirlo en tests separados daría fallos en cascada engañosos |

## Consecuencias

- `npm test` necesita Docker corriendo, en la máquina (RUNBOOK, sección 1) y en CI (el runner lo
  trae). Sin Docker, el test de migraciones falla al levantar el contenedor; los de dominio corren
  igual.
- Toda migración nueva entra al test sola. Si su `down.sql` no revierte exactamente lo que hace, o
  si `schema.prisma` no coincide con la cadena, `npm test` queda en rojo.
- Un `down.sql` no puede tener `BEGIN`/`COMMIT` propios (docs/convenciones-base.md).
- `db:migrate:down` necesita el servicio `postgres` de compose levantado, y que `DATABASE_URL`
  apunte a `localhost:5432` (el puerto del contenedor adentro de compose).
- La corrida de CI suma lo que tarda el test (bajar la imagen de Postgres y la de Ryuk, levantar,
  migrar y revertir). Tiempos anotados en el PR de F0-09.

## Cómo se revierte

- **Con driver (desde F0-10):** reemplazar los dos `EjecutarPsql` por uno que use `pg` contra la
  `DATABASE_URL`. El resto del módulo y el test no cambian. Podría sacar la restricción de "solo
  compose" del script, pero no la de "solo local", que es otra decisión.
- **Test fuera de `npm test`:** cuando F0-14 separe los niveles, `vitest.config.ts` saca
  `tests/casos-uso/` de la tanda por defecto y el nivel de casos de uso lo corre aparte (CI lo tiene
  que seguir corriendo).
- **Sin Testcontainers:** borrar la dependencia y el test. Se pierde el criterio del cimiento 3
  hasta reemplazarlo por otro test contra un Postgres real.
