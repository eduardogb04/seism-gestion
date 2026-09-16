# ADR 0011 — Drift de esquema en CI: cómo se compara sin shadow database

> Archivo: `docs/adr/0011-drift-de-esquema-en-ci.md`. Numeración correlativa, nunca se reutiliza.
> Un ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se
> marca *Reemplazado por NNNN*.

**Fecha:** 2026-09-15
**Estado:** Propuesto
**Tarea:** F0-11
**Decide:** el plan (cimiento 2: *"un cambio de esquema sin su migración hace fallar la
corrida"*) fija el criterio; el orquestador de Fase 0 resuelve las dos partes que el plan no podía
fijar sin ver la versión instalada de Prisma (los flags de `migrate diff` y cómo evitar una shadow
database nueva)

## Contexto

El plan (F0-11) pedía `prisma migrate diff --from-migrations --to-schema-datamodel` para comparar
`prisma/migrations/` contra `prisma/schema.prisma` sin necesidad de una base ya migrada. Esos flags
son de Prisma 5/6; no existen en Prisma 7.10.0 (fijado exacto desde F0-08). La combinación
equivalente en 7.10, `--from-migrations --to-schema`, sí existe, pero comparar **desde una carpeta
de migraciones** exige que Prisma las replique en una base descartable para saber a qué esquema
llegan (`Error: You must set 'datasource.shadowDatabaseUrl' in your 'prisma.config.ts' if you want
to diff a migrations directory`, verificado a mano contra la base local). Eso es una shadow
database: una segunda conexión a configurar y mantener, que ni el plan ni P6 (esquema mínimo) piden
para nada más.

## Decisión

**Comparar la base ya migrada contra el esquema, no las migraciones contra el esquema.** El paso
`drift` de `ci.yml` corre, en este orden:

1. Un `services: postgres` en el job `ci` (la misma imagen, con tag y digest, de
   `docker-compose.yml`): un Postgres descartable del runner, aparte del que crea y borra
   `tests/casos-uso/migraciones.test.ts` con Testcontainers en el paso `test` (ese no sobrevive al
   paso).
2. Un paso `Migrar (para el paso de drift)` que corre `npm run db:migrate` (`prisma migrate
   deploy`) contra ese Postgres: aplica exactamente las migraciones que ya están en el repo, nada
   más.
3. El paso `drift`: `prisma migrate diff --from-config-datasource --to-schema
   prisma/schema.prisma --exit-code`. Compara el esquema resultante de esas migraciones con
   `schema.prisma`. Si alguien cambió `schema.prisma` sin agregar la migración correspondiente, la
   base migrada y el esquema no coinciden y el diff no da vacío — es la misma comparación que ya
   hace `tests/casos-uso/migraciones.test.ts` (F0-09) después de aplicar la cadena entera, solo que
   acá corre como paso propio de `ci.yml`, con nombre y mensaje fijos, en vez de como una aserción
   más de un test de Vitest.

`--exit-code` devuelve 0 sin diferencia, 2 con diferencia, 1 si la herramienta misma falló (por
ejemplo, no llegó a la base). El paso separa los dos casos: código 2 escribe
`::error::hay un cambio en \`schema.prisma\` sin migración` (el mensaje que pide el criterio) y
código 1 escribe que `prisma migrate diff` falló, sin inventar que hay drift cuando el problema fue
otro. Los dos salen 1 y ponen el paso en rojo.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `--from-migrations --to-schema` (el equivalente 7.x de lo que pedía el plan) | Pide `datasource.shadowDatabaseUrl`: una base descartable *además* de la que ya se agrega para poder migrar y comparar. Dos bases para un solo control, cuando con una alcanza |
| Agregar `shadowDatabaseUrl` a `prisma.config.ts` para poder usar `--from-migrations` | Es la misma complejidad que la alternativa de arriba, fijada en la configuración del repo en vez de en el workflow: la sigue pagando cualquiera que corra la CLI en local, no solo CI |
| Reusar el Postgres de Testcontainers del paso `test` | Vive y muere dentro de ese paso (`beforeAll`/`afterAll` de Vitest); no hay forma de que un paso de `ci.yml` posterior le hable sin reescribir el test para que deje el contenedor vivo, lo que contradice "el test no deja contenedores vivos ni estado entre corridas" (criterio de F0-09) |
| Que el mensaje de drift sea el mismo para cualquier código de salida distinto de 0 | Código 1 (herramienta que no pudo correr, p. ej. sin conexión a la base) no es "hay un cambio sin migración": decirlo igual sería un diagnóstico falso para quien lea el log |

## Consecuencias

- El control de drift depende de un Postgres más en el job `ci` (el `services: postgres`), además
  del que ya usa Testcontainers en el paso `test`: dos Postgres efímeros por corrida, ninguno
  persiste. Tiempo agregado, medido: **el detalle exacto queda en el PR de F0-11** (P9, tope de 10
  minutos).
- Si `docker-compose.yml` sube la imagen de Postgres, hay que subir la del `services:` de `ci.yml`
  a mano (ya era así con la de Testcontainers, que la lee del propio `docker-compose.yml`; esta
  tercera copia queda fija en el workflow porque `services:` no admite leer un archivo).
- El paso `Migrar (para el paso de drift)` corre `prisma migrate deploy` de verdad: si una
  migración ya aplicada estuviera rota, ese paso lo muestra (con el error de Prisma, no con el
  mensaje de drift) antes de llegar al paso `drift`.
- Quién lo hace cumplir: el paso `drift` de `.github/workflows/ci.yml`, dentro del check `ci` que
  la rama protegida exige (F0-06).

## Cómo se revierte

Si algún día compensa la shadow database (por ejemplo, porque el esquema crece y comparar contra
una base ya migrada deja de alcanzar), se agrega `datasource.shadowDatabaseUrl` a
`prisma.config.ts`, se cambia el paso `drift` a `--from-migrations prisma/migrations --to-schema
prisma/schema.prisma --exit-code` y se decide si todavía hace falta el paso de migrar antes. El
`services: postgres` de `ci.yml` serviría igual como shadow database, o como base para las dos
cosas.
