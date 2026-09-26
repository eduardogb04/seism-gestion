# ADR 0022 — Almacén de documentos: un puerto, disco y S3, y MinIO de Bitnami por digest

> Archivo: `docs/adr/0022-almacen-documentos.md`. Numeración correlativa, nunca se reutiliza. Un ADR
> aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*.

**Fecha:** 2026-09-26
**Estado:** Propuesto
**Tarea:** F0-27
**Decide:** el plan (F0-27) · Eduardo (dependencias `@aws-sdk/*` e imagen de MinIO, 2026-09-25)

## Contexto

*"Los documentos van a storage y en la base queda el metadato."* En local no hay por qué depender de
un servicio; en el servidor va Cloudflare R2, que habla S3. Hacía falta un puerto con dos
implementaciones que se comporten igual, un S3 local para probar la de S3, y una regla para las
claves que impida que una clave rara salga de la carpeta o del bucket.

## Decisión

Un puerto `AlmacenDocumentos` (`src/puertos/almacen-documentos.ts`) con dos adaptadores,
`disco` y `s3`, que pasan **la misma** suite de contrato (`tests/contratos/almacen-documentos.ts`);
`ALMACEN=disco|s3` elige en el punto de armado (`src/infraestructura/arranque/almacen.ts`).

- **Puerto.** `guardar(clave, bytes, tipoMime) → Referencia`, `leer(ref) → Uint8Array`,
  `existe(ref)`, `urlTemporal(ref, minutos)`. Bytes como `Uint8Array` (un puerto no importa
  `node:*`). `Referencia` es un string marcado por tipo: la clave ya validada.
- **Claves.** Una sola validación, en el puerto, que aplican los dos adaptadores en **cada**
  operación (también al leer: la referencia puede venir de la base): `^[a-z0-9-]+(/[a-z0-9-]+)*$`,
  de 1 a 512 caracteres. Rechaza `..`, barras en los bordes o dobles, barra invertida, espacios,
  mayúsculas, acentos, no-ASCII y `%` con `ALM-0002`. Las claves nuevas las arma
  `claveDocumento(reloj, generadorId)`: `documentos/<año del reloj>/<uuid>`.
- **Errores.** Leer lo que no existe: `ALM-0001`. Vigencia de `urlTemporal` fuera de 1..10080
  minutos (una semana, el máximo que firma S3): `ALM-0003`. Cualquier otra falla del disco o de
  S3 (permisos, bucket inexistente, credenciales): `INF-0001`, con la causa adentro.
- **Disco.** Carpeta `ALMACEN_DIRECTORIO`; archivos `600` y carpetas `700`; escritura atómica
  (temporal al lado con un `.` en el nombre, que ninguna clave puede tener, y `rename`).
  `urlTemporal` devuelve `/api/documentos/<clave>?expira=<epoch en segundos>`: la ruta la sirve
  la app cuando exista la subida (fuera de F0-27).
- **S3.** `@aws-sdk/client-s3` con `forcePathStyle: true` (MinIO no tiene DNS por bucket) y los
  checksums automáticos del SDK solo cuando la operación los exige (`WHEN_REQUIRED`): los que el
  SDK agrega por defecto no los acepta todo servicio compatible. `urlTemporal` es una URL firmada
  de `GetObject` con `@aws-sdk/s3-request-presigner`. Región `S3_REGION`, por defecto `auto` (R2).
- **MinIO.** La imagen oficial ya no se puede bajar: `minio/minio` y `minio/mc` no existen más en
  Docker Hub (la API devuelve 404, `docker pull` dice *repository does not exist*) y
  `quay.io/minio/minio` pide autenticación (401), verificado el 2026-09-26. Se usa
  `bitnamilegacy/minio` —el mismo servidor de MinIO, empaquetado por Bitnami, que trae `mc`
  adentro—, fijada por tag y digest
  (`2025.7.23-debian-12-r5@sha256:6dabb4a2…`), en `docker-compose.yml` (servicios `minio` y
  `minio-init`, que crea el bucket con `mc mb --ignore-existing`). El arnés de Testcontainers
  (`tests/casos-uso/_arnes/minio.ts`) lee la imagen de esa línea: una sola fuente, y falla si los
  dos servicios difieren o si falta el digest. Se corre `minio server` directo, sin los scripts de
  arranque de Bitnami.
- **Cómo se prueba.** Disco contra una carpeta temporal; S3 contra MinIO en Testcontainers **y**
  contra los servicios de `docker-compose.yml` levantados por el test (proyecto de compose al azar,
  `MINIO_PUERTO` libre) con las `S3_*` de `.env.example`. La propiedad de bytes al azar corre 100
  veces en disco y 25 en cada S3.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Una suite por adaptador | Dos suites derivan: la gracia es que lo que pasa en local pase igual en el servidor |
| `Buffer` o `Readable` en el puerto | `puertos` no puede importar `node:*` (ADR 0004); `Uint8Array` es estándar |
| Validar la clave solo en `guardar` | Una `Referencia` leída de la base es un string cualquiera: `leer("../x")` llegaría al disco |
| `minio/minio` por tag | Ya no se descarga; un tag, además, se mueve |
| Otro producto S3 (SeaweedFS, Garage...) | Cambia de producto; no es lo aprobado. Queda como salida si Bitnami también se retira |
| `@testcontainers/minio` | Otra dependencia; `GenericContainer` de `testcontainers`, que ya está, alcanza |
| `MINIO_DEFAULT_BUCKETS` de Bitnami para el bucket | Ata el compose a los scripts de Bitnami; un `mc mb` es portable a cualquier imagen de MinIO |
| Servicio `minio` en `ci.yml` | Testcontainers ya levanta MinIO en el runner (como Postgres) |

## Consecuencias

- La app no sabe si guarda en disco o en S3; F0-36 prueba R2 con credenciales, sin código nuevo.
- `ALMACEN` es obligatoria: todo lo que valida el entorno la necesita (la app, `db:migrate` en CI,
  `imagen:prueba`, el servicio `app` del e2e, los `docker run` del README y del RUNBOOK).
- `bitnamilegacy/minio` es un repositorio congelado: no recibe parches. Es solo para desarrollo y
  tests (escucha en `127.0.0.1`, datos ficticios); en el servidor va R2. Se sube a mano,
  como la de Postgres de compose.
- Lo hacen cumplir: la suite de contrato (los dos adaptadores), `tests/dominio/almacen-claves.test.ts`
  (claves y vigencia), `tests/dominio/entorno.test.ts` (variables), el test de la imagen única en
  `tests/casos-uso/almacen-s3.test.ts`, y `puertos-solo-dominio` de dependency-cruiser.

## Cómo se revierte

- **Otra imagen de MinIO** (o de otro S3 compatible, si Eduardo lo decide): cambiar la línea
  `image:` de `minio` y `minio-init` en `docker-compose.yml` (y el `entrypoint`/`command` si la
  imagen no trae `minio` y `mc`). El arnés la toma de ahí; la suite dice si el reemplazo se
  comporta igual.
- **Otro almacén**: un adaptador nuevo que pase la suite y un `case` más en `arranque/almacen.ts`
  y en el esquema de `entorno.ts`. El puerto no cambia.
