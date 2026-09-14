# ADR 0008 — Prisma: cliente generado en adaptadores, entorno validado y reversión con `down.sql`

> Archivo: `docs/adr/0008-prisma-y-reversion.md`. Numeración correlativa, nunca se reutiliza. Un
> ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*. (El plan le asignaba el número 0003; ese número ya estaba tomado.)

**Fecha:** 2026-09-14
**Estado:** Propuesto
**Tarea:** F0-08
**Decide:** el plan (P1 reversión, P6 esquema mínimo y nombres) y el orquestador de Fase 0
(ubicación del cliente, validación en `db:migrate`, credenciales locales con valor); el resto, el
dev de F0-08

## Contexto

F0-08 trae la base: Postgres 16 local en compose, Prisma con la tabla `configuracion` y su primera
migración, `DATABASE_URL` validada al arrancar y `npm run db:migrate` real. Prisma 7 cambió varias
cosas respecto de lo que conocen los modelos (el generador `prisma-client` escribe TypeScript en
una carpeta propia, la URL va en `prisma.config.ts`, la CLI ya no lee `.env`), y el repo tiene
reglas que chocan con código generado: `sin-any.ts`, Biome, `no-circular` y el TypeScript severo.
Además, Prisma solo ofrece migraciones hacia adelante, y el cimiento 3 exige revertirlas (P1).

## Decisión

**Prisma 7.10.0, con el cliente generado adentro de `src/adaptadores/prisma/generado/` (sin
versionar), la URL validada por el mismo esquema Zod que la app antes de cualquier comando de base,
y un `down.sql` por migración generado con `prisma migrate diff` y revisado a mano.**

1. **Versiones.** `prisma` (dev) y `@prisma/client` fijados exactos en **7.10.0**, la última
   estable (en npm, `latest` apunta a una 8.0.0-rc). Piden `typescript >=5.4.0`: `typescript` sigue
   en 6.0.3. No hace falta ningún adaptador de driver para generar ni para migrar (la CLI se
   conecta sola); `@prisma/adapter-pg` entra con el primer código que instancie el cliente
   (F0-10, la semilla), no antes.
2. **Cliente generado.** Generador `prisma-client` con `output =
   "../src/adaptadores/prisma/generado"`, `moduleFormat = "esm"` e `importFileExtension = "ts"`
   (como el resto del repo: imports con extensión `.ts`, Node corre TypeScript directo).
   - **No se versiona** (`/src/adaptadores/prisma/generado/` en `.gitignore`): lo escribe
     `postinstall` (`prisma generate`) en cada `npm install`/`npm ci` —en la máquina, en CI y en el
     build de la imagen— y `npm run db:generar` a mano. `prisma generate` no se conecta a ninguna
     base: CI sigue sin base (entra en F0-11).
   - **Límites.** Vive en `src/adaptadores/`, así que las reglas por capa le aplican como a
     cualquier adaptador: `dominio`, `puertos` y `casos-uso` no pueden importarlo, y `app`/`worker`
     solo por `src/infraestructura/arranque/`. Nuevo archivo en el fixture `casos-uso-sin-afuera`
     (`usa-cliente-prisma-generado.ts`) que lo prueba.
   - **Excepciones, solo por ser generado:** `scripts/sin-any.ts` saltea esa carpeta (trae `any`
     propios), Biome la excluye en `files.includes` (además de por `.gitignore`), y `no-circular`
     exceptúa los ciclos que **empiezan** en ella (el cliente tiene ciclos entre sus propios
     archivos); un ciclo que pase por un archivo nuestro se sigue informando. `tsc` la sigue
     incluyendo: cada archivo generado trae `// @ts-nocheck`, así que las opciones severas no le
     aplican por dentro, pero los tipos que exporta se chequean donde se usen.
3. **Entorno.** `DATABASE_URL` entra al esquema de `src/infraestructura/entorno.ts` como
   `z.url({ protocol: /^postgres(ql)?$/ })`. Si falta, está vacía o no es `postgresql://` o
   `postgres://`, el mensaje nombra la variable, dice qué forma se espera y **no repite el valor**
   (lleva la clave). `validarEntorno` recibe qué proceso no arranca (`"la app"` por defecto,
   `"db:migrate"` en el script). Tests de nivel dominio: ausente, vacía, inválida, válida.
4. **`npm run db:migrate`** = `scripts/db-migrate.ts`: carga `.env` si existe (sin pisar el entorno
   del proceso, `process.loadEnvFile`), valida el entorno **completo** con `exigirEntornoValido` y
   recién entonces corre `prisma migrate deploy`. Sin entorno válido, sale 1 y Prisma ni se
   ejecuta. El placeholder de F0-01 (`scripts/db-migrate-pendiente.ts`) se borró.
5. **`prisma.config.ts`** (raíz): rutas del esquema y las migraciones, carga `.env` si existe y
   pasa `datasource.url` **solo si** `DATABASE_URL` está definida. No valida: si lo hiciera,
   `prisma generate` (que corre sin base en CI y en la imagen) fallaría. La validación vive en los
   comandos `npm run db:*`, que son la puerta de entrada documentada.
6. **Reversión (P1).** Cada carpeta de `prisma/migrations/` lleva `migration.sql` y `down.sql`. El
   `down.sql` se genera con `prisma migrate diff --from-schema <nuevo> --to-empty|--to-schema
   <anterior> --script` y se revisa a mano (procedimiento en `docs/convenciones-base.md`).
   **Revierte solo esquema** y **no toca `_prisma_migrations`**: borrar el registro de la migración
   es trabajo del script `db:migrate:down` (F0-09), no del SQL. "Base vacía" = sin tablas propias.
   Verificado a mano contra el Postgres de compose en F0-08: aplicar, `down.sql`, cero tablas
   propias, borrar el registro, volver a aplicar.
7. **Esquema (P6).** `configuracion` con lo que pide el criterio (`clave` única, `valor` texto,
   `actualizado_en`, `actualizado_por` nullable) más las columnas que P6 fija para toda tabla:
   `id` UUID (`gen_random_uuid()` en la base) y `creado_en`. Sin `eliminado_en`: un parámetro no se
   borra lógicamente. Tiempos `timestamptz(3)`. `actualizado_por` es `uuid`: va a apuntar a
   `usuarios` (lote 8).
8. **Compose.** Solo Postgres (MinIO es F0-27): `postgres:16.15-alpine` **fijado por tag y
   digest** (como la base del `Dockerfile`, ADR 0006 y 0007), volumen nombrado `postgres-datos`,
   `healthcheck` con `pg_isready` sobre la base de la app, puerto publicado solo en `127.0.0.1`.
   Usuario, clave y base son **de desarrollo local, ficticios y descartables**; llevan valor en
   `docker-compose.yml` y en la `DATABASE_URL` de `.env.example` (decisión del orquestador). Si
   gitleaks los marcara, la excepción va **puntual** en `.gitleaks.toml` (por archivo y patrón),
   nunca desactivando reglas.
9. **Imagen.** El `Dockerfile` copia `prisma.config.ts` y `prisma/schema.prisma` antes de `npm ci`
   (el `postinstall` los necesita) y el `.dockerignore` deja afuera el cliente generado de la
   máquina (se regenera adentro). `npm run imagen:prueba` levanta el contenedor con una
   `DATABASE_URL` válida y ficticia (la app todavía no se conecta) y exige que **sin**
   `APP_ENTORNO` ni `DATABASE_URL` salga 1 nombrando las dos.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Generador `prisma-client-js` (cliente en `node_modules/.prisma`) | Deprecado en Prisma 7. Y deja el cliente fuera de `src/adaptadores/`: el límite dependería solo del patrón `@prisma/*` y no del lugar donde el diseño dice que vive Prisma |
| Versionar el cliente generado | Miles de líneas que no escribe nadie en cada diff, y la posibilidad de que el versionado y el esquema se desincronicen. Regenerarlo en `postinstall` es barato y no necesita base |
| Prisma 8 | Todavía es release candidate. Se sube con un PR propio cuando salga estable |
| Validar `DATABASE_URL` dentro de `prisma.config.ts` | `prisma generate` carga esa configuración y corre sin base (CI, imagen): fallaría. La validación va en los comandos `npm run db:*` |
| `dotenv` para leer `.env` | Dependencia nueva para algo que Node 24 ya trae (`process.loadEnvFile`) |
| Que el `down.sql` borre su fila de `_prisma_migrations` | Mezcla el esquema con la contabilidad interna de Prisma y ata el SQL a una tabla que no es nuestra. Lo hace el script de F0-09 |
| Solo hacia adelante (lo que recomienda Prisma) | No cumple el cimiento 3 (P1) |
| `prisma db push` para el esquema local | Cambia la base sin migración: contradice la regla "nadie toca la base a mano" |
| Postgres por tag solo (`postgres:16`) | Un tag se mueve; el resto del repo fija por digest |

## Consecuencias

- El núcleo no ve Prisma y dependency-cruiser lo prueba con un fixture; cambiar de ORM sigue siendo
  reescribir `src/adaptadores/prisma/`.
- `npm install` necesita `prisma/schema.prisma` y `prisma.config.ts` presentes (el `postinstall`
  los lee). Una etapa de Docker que haga `npm ci` tiene que copiarlos antes.
- Tres herramientas tienen una excepción por ruta para `src/adaptadores/prisma/generado/`
  (`sin-any.ts`, Biome, `no-circular`). Lo hace cumplir la revisión: **nada escrito a mano va en
  esa carpeta** (y nada ahí entra a git).
- Cada migración cuesta un paso más (generar y revisar el `down.sql`). Hasta F0-09 la reversión se
  verifica a mano contra compose; desde F0-09, un test; desde F0-11, en CI.
- `DATABASE_URL` es obligatoria para arrancar la app aunque todavía no se conecte: quien levante la
  imagen tiene que pasarla (RUNBOOK, secciones 14 y 15).

## Cómo se revierte

- **Otro ORM:** borrar `prisma/`, `prisma.config.ts`, las dos dependencias, el `postinstall`,
  `db:generar`, la línea de `.gitignore`, `.dockerignore` y el `COPY` del `Dockerfile`, y las tres
  excepciones de `src/adaptadores/prisma/generado/`. `db:migrate` cambia el comando que ejecuta;
  la validación del entorno queda igual.
- **Cliente en otra carpeta:** cambiar `output` en `schema.prisma` y la ruta en `.gitignore`,
  `.dockerignore`, `biome.json`, `sin-any.ts` y `.dependency-cruiser.cjs` (y, si queda fuera de
  `src/adaptadores/`, sumarla a las reglas por capa con su fixture).
- **Sin `down.sql`:** no se revierte sin reemplazar P1 con otra forma de cumplir el cimiento 3.
