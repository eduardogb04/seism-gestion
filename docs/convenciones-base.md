# Convenciones de la base de datos

> Primera versión en F0-08. F0-09 sumó el test que aplica y revierte la cadena entera y
> `npm run db:migrate:down`. F0-11 suma el control de drift en CI. Decisiones y porqués: ADR 0008
> (Prisma y `down.sql`) y ADR 0009 (reversión y test).

## La regla

**Nadie toca la base a mano. Todo cambio de esquema es una migración, y toda migración trae su
`down.sql`.** Ni `ALTER TABLE` en una consola, ni `prisma db push`, ni SQL suelto para "arreglar"
algo, ni editar una migración que ya entró a `main`. Si el esquema de una base no coincide con
`prisma/migrations/`, esa base está mal, no las migraciones.

Vale también para el Postgres **local** de `docker-compose.yml`. Para aplicar, `npm run db:migrate`.
Para revertir, `npm run db:migrate:down`. Para empezar de cero, `docker compose down -v` (borra el
volumen). `psql` contra la base local sirve para **mirar** (`\dt`, un `select`), no para cambiarla.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| El esquema | `prisma/schema.prisma` |
| Las migraciones | `prisma/migrations/<marca>_<nombre>/migration.sql` y `down.sql` |
| El proveedor de las migraciones | `prisma/migrations/migration_lock.toml` (lo escribe Prisma; se versiona, no se edita) |
| La configuración de la CLI | `prisma.config.ts`: rutas del esquema y las migraciones, y la URL desde `DATABASE_URL` |
| La URL de la base | `DATABASE_URL` en `.env` (local) o en el entorno del proceso (servidor). La valida `src/infraestructura/entorno.ts` |
| El cliente generado | `src/adaptadores/prisma/generado/`. **No se versiona**: lo escribe `prisma generate` |
| La base local | `docker-compose.yml`: Postgres 16, volumen `postgres-datos`, solo en `127.0.0.1:5432` |
| La reversión | `scripts/lib/migraciones.ts` (la usan `db:migrate:down` y el test) |
| El test de la cadena | `tests/casos-uso/migraciones.test.ts` |

## Nombres (P6)

- **Tablas** en castellano y `snake_case`, con el nombre que fija el plan para cada una
  (`configuracion`, `corridas_worker`, `fallidos`, `uso_ia`, `usuarios`, `sesiones`,
  `auditoria`). En Prisma, el modelo va en `PascalCase` y se mapea con `@@map("nombre_tabla")`.
- **Columnas** en `snake_case` en la base y `camelCase` en TypeScript: `creadoEn DateTime
  @map("creado_en")`.
- **`id`**: UUID generado por la base, `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`.
- **`codigo`**: el identificador legible, donde aplique (lo trae F0-19).
- **Tiempos**: `creado_en` y, si la fila se modifica, `actualizado_en`, siempre
  `@db.Timestamptz(3)` (con zona horaria, milisegundos).
- **`eliminado_en`** (`timestamptz`, nullable) en las tablas con borrado lógico: una fila de
  negocio no se borra, se marca. Una tabla de parámetros como `configuracion` no lo lleva.
- Nada de esquema especulativo: cada tabla nace en la tarea que la usa.

## El ciclo de una migración

```
schema.prisma  →  migrate dev  →  down.sql con migrate diff  →  revisión a mano
               →  commit de los dos archivos  →  npm test en verde (el test de migraciones)
```

Con la base local levantada (`docker compose up -d --wait`) y `.env` copiado de `.env.example`:

1. **Cambiar `prisma/schema.prisma`.**
2. **Crear la migración con `migrate dev`, sin aplicarla todavía:**
   ```
   npx prisma migrate dev --create-only --name <nombre_en_snake_case>
   ```
   Deja `prisma/migrations/<marca>_<nombre>/migration.sql`. Leerlo entero: es lo que va a correr en
   el servidor. Si Prisma avisa que va a perder datos, se para y se piensa.
3. **Generar el `down.sql`** en la misma carpeta, con `prisma migrate diff` desde el esquema nuevo
   hacia el anterior:
   - Primera migración (no hay esquema anterior):
     ```
     npx prisma migrate diff --from-schema prisma/schema.prisma --to-empty --script > prisma/migrations/<carpeta>/down.sql
     ```
   - Las siguientes, contra el esquema de `main`:
     ```
     git show origin/main:prisma/schema.prisma > <carpeta-temporal>/schema-anterior.prisma
     npx prisma migrate diff --from-schema prisma/schema.prisma --to-schema <carpeta-temporal>/schema-anterior.prisma --script > prisma/migrations/<carpeta>/down.sql
     ```
   En PowerShell, `>` escribe UTF-16: redirigir con `| Out-File -Encoding utf8` o correrlo desde
   Git Bash.
4. **Revisar a mano los dos archivos.** El `down.sql` tiene que deshacer **exactamente** lo que
   hace `migration.sql`, en orden inverso, y nada más: tablas, columnas, índices, y también tipos
   (`enum`) y secuencias. Encabezado en comentario: qué migración revierte, con qué comando se
   generó y qué se revisó. **Sin `BEGIN` ni `COMMIT`**: la reversión ya lo envuelve en una
   transacción (ADR 0009). El `down.sql` revierte **esquema**: los datos que una migración borra no
   vuelven (P1).
5. **Aplicarla en local y probar la vuelta** (opcional, el test lo hace igual):
   ```
   npm run db:migrate        # prisma migrate deploy, después de validar el entorno
   npm run db:generar        # prisma generate: el cliente de src/adaptadores/prisma/generado/
   npm run db:migrate:down   # revierte la última: la nueva
   npm run db:migrate        # y la vuelve a aplicar
   ```
6. **Commit de los dos archivos de la migración** (`migration.sql` y `down.sql`) junto con
   `schema.prisma`, en el mismo commit.
7. **`npm test` en verde.** El test de migraciones recorre `prisma/migrations/` y toma la migración
   nueva solo, sin tocarlo (sección siguiente). Necesita Docker corriendo. CI lo corre en cada push.

Una migración que ya entró a `main` **no se edita nunca**: si está mal, se corrige con otra
migración (con su propio `down.sql`).

## El test de migraciones

`tests/casos-uso/migraciones.test.ts` corre dentro de `npm test` (y de CI). Levanta un Postgres 16
efímero con Testcontainers, con **la misma imagen** que `docker-compose.yml`, y:

1. Exige un `down.sql` en cada carpeta de `prisma/migrations/`.
2. Aplica la cadena entera con `prisma migrate deploy` y comprueba que `_prisma_migrations` tiene
   todas, en orden.
3. Exige que `prisma migrate diff` entre la base y `schema.prisma` dé **vacío**. Si no, el esquema y
   las migraciones no coinciden (típico: se cambió `schema.prisma` y no se creó la migración).
4. Revierte la cadena entera, de la última a la primera, con el mismo código que
   `db:migrate:down`.
5. Exige la base **vacía**: ninguna tabla propia y `prisma migrate diff` contra una base vacía sin
   diferencias. Un tipo o una secuencia que el `down.sql` olvidó también lo pone en rojo.
6. Exige `_prisma_migrations` sin filas y vuelve a aplicar la cadena entera.

No deja contenedores ni datos: el Postgres guarda en memoria (`tmpfs`) y se borra al terminar. Si
la corrida se corta, lo borra Ryuk, el recolector de Testcontainers, unos segundos después.

**Si está en rojo**, el mensaje dice qué paso falló:
- `migraciones sin down.sql (P1)` → falta el `down.sql` de la carpeta que nombra.
- Una lista de tablas donde se esperaba `[]` → el `down.sql` no borra esas tablas.
- `expected 2 to be +0` con un resumen de Prisma (`[+] Added column…`, `- <tipo>`) → el diff no dio
  vacío. Después de aplicar: `schema.prisma` y las migraciones no coinciden. Después de revertir:
  el `down.sql` dejó eso suelto.
- `{ tipo: "error", mensaje: … }` → `psql` rechazó el `down.sql`. El mensaje trae el error de
  Postgres.
- No arranca el contenedor → Docker no está corriendo (RUNBOOK, sección 1).

## Revertir en local: `npm run db:migrate:down`

Revierte **la última migración aplicada** en la base local, **una por corrida**:

- Valida el entorno igual que `db:migrate` (sin `DATABASE_URL` válida no arranca).
- **Solo contra la base local**: si `DATABASE_URL` no apunta a `localhost`, sale 1 sin tocar nada.
  En el servidor no se revierte con este script.
- Corre `psql` adentro del servicio `postgres` de compose: el servicio tiene que estar levantado.
- En **una transacción**: aplica el `down.sql` y borra la fila de la migración de
  `_prisma_migrations`. Si algo falla, no queda nada a medias. Después, `npm run db:migrate` la
  vuelve a aplicar.
- Imprime `db:migrate:down: revertida <carpeta> …` y sale 0. Si la base no tiene migraciones
  aplicadas, lo dice y sale 1. Si la última aplicada no tiene `down.sql` en el repo, no toca nada y
  sale 1.

Para revertir varias, se corre varias veces. Para mirar cómo quedó:

```
docker compose exec -T postgres psql -U seism -d seism_gestion -c "\dt"
```

### `_prisma_migrations` no es una tabla propia

Es el registro de Prisma de qué migraciones se aplicaron. La crea `prisma migrate` y **ningún
`down.sql` la toca**: cada `down.sql` revierte solo el esquema de su migración. La fila la borra la
reversión (`db:migrate:down` y el test), en la misma transacción. "Base vacía" quiere decir **sin
tablas propias**: revertida la cadena entera, `_prisma_migrations` queda, sin filas.

## Nunca

- `prisma db push`: cambia la base sin migración.
- SQL que cambie la base escrito a mano, tampoco en la local: para eso están `db:migrate` y
  `db:migrate:down`.
- `prisma migrate reset` o `migrate dev` contra algo que no sea la base local: borran datos.
- Editar `migration.sql` o `down.sql` de una migración que ya está en `main`.
- `BEGIN` o `COMMIT` en un `down.sql`.
- Importar el cliente generado fuera de `src/adaptadores/`: dependency-cruiser lo rechaza desde
  `dominio`, `puertos` y `casos-uso` (`npm run limites`), y desde `app`/`worker` solo se llega por
  `src/infraestructura/arranque/`.
- Una URL con clave real en `.env.example`, en un test o en un documento. La de `.env.example` es
  la del contenedor local, ficticia.
