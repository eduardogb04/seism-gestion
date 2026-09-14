# Convenciones de la base de datos

> Primera versión (F0-08). F0-09 suma el test que aplica y revierte la cadena entera y el script
> `db:migrate:down`; F0-11, el control de drift en CI. Decisiones y porqués: ADR 0008.

## La regla

**Nadie toca la base a mano. Todo cambio de esquema es una migración, y toda migración trae su
`down.sql`.** Ni `ALTER TABLE` en una consola, ni `prisma db push`, ni editar una migración que ya
entró a `main`. Si el esquema de una base no coincide con `prisma/migrations/`, esa base está mal,
no las migraciones.

La única base en la que se ejecuta SQL suelto es el Postgres **local** de `docker-compose.yml`, y
solo para verificar una reversión mientras no exista `db:migrate:down` (ver *Verificar la
reversión*). Es descartable: `docker compose down -v` la deja vacía.

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

## Cómo nace una migración

Con la base local levantada (`docker compose up -d`) y `.env` copiado de `.env.example`:

1. **Cambiar `prisma/schema.prisma`.**
2. **Crear la migración sin aplicarla:**
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
4. **Revisar el `down.sql` a mano.** Tiene que deshacer **exactamente** lo que hace
   `migration.sql`, en orden inverso, y nada más. Encabezado en comentario: qué migración revierte,
   con qué comando se generó y qué se revisó. El `down.sql` revierte **esquema**: los datos que una
   migración borra no vuelven (P1).
5. **Aplicar y regenerar el cliente:**
   ```
   npm run db:migrate    # prisma migrate deploy, después de validar el entorno
   npm run db:generar    # prisma generate: el cliente de src/adaptadores/prisma/generado/
   ```
6. **Verificar la reversión** (sección siguiente).
7. **Commit** de `schema.prisma`, `migration.sql` y `down.sql` juntos, en el mismo commit.

Una migración que ya entró a `main` **no se edita nunca**: si está mal, se corrige con otra
migración (con su propio `down.sql`).

## Verificar la reversión

Desde F0-09, lo verifica un test que levanta un Postgres efímero, aplica la cadena entera, compara
con `schema.prisma`, aplica todos los `down.sql` en orden inverso y exige la base sin tablas
propias. Hasta entonces, a mano, **solo contra la base local**:

```
npm run db:migrate
docker compose exec -T postgres psql -U seism -d seism_gestion -v ON_ERROR_STOP=1 < prisma/migrations/<carpeta>/down.sql
docker compose exec -T postgres psql -U seism -d seism_gestion -c "\dt"
```

Después del `down.sql` de la única migración, `\dt` tiene que mostrar **solo**
`_prisma_migrations`. Para volver a aplicarla hay que borrar su registro (es lo que va a hacer
`npm run db:migrate:down` de F0-09):

```
docker compose exec -T postgres psql -U seism -d seism_gestion -c "delete from _prisma_migrations where migration_name = '<carpeta>'"
npm run db:migrate
```

### `_prisma_migrations` no es una tabla propia

Es el registro de Prisma de qué migraciones se aplicaron. La crea `prisma migrate` y **ningún
`down.sql` la toca**: cada `down.sql` revierte solo el esquema de su migración. "Base vacía" quiere
decir **sin tablas propias**; `_prisma_migrations` puede quedar, vacía o no.

## Nunca

- `prisma db push`: cambia la base sin migración.
- `prisma migrate reset` o `migrate dev` contra algo que no sea la base local: borran datos.
- Editar `migration.sql` o `down.sql` de una migración que ya está en `main`.
- Importar el cliente generado fuera de `src/adaptadores/`: dependency-cruiser lo rechaza desde
  `dominio`, `puertos` y `casos-uso` (`npm run limites`), y desde `app`/`worker` solo se llega por
  `src/infraestructura/arranque/`.
- Una URL con clave real en `.env.example`, en un test o en un documento. La de `.env.example` es
  la del contenedor local, ficticia.
