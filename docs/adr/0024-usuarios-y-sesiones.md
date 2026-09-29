# ADR 0024 — Usuarios, sesiones y auditoría en Postgres

> Archivo: `docs/adr/0024-usuarios-y-sesiones.md`. Numeración correlativa, nunca se reutiliza. Un
> ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*.

**Fecha:** 2026-09-26
**Estado:** Propuesto
**Tarea:** F0-30
**Decide:** el plan (P4: lista blanca y sesiones en Postgres; F0-30) y el orquestador (R3 a R8 de
la ficha: email sin mayúsculas, sesiones que se borran, `revocar` en una transacción, primer
administrador por `db:seed`)

## Contexto

Hacía falta dónde viven los usuarios habilitados (la lista blanca), sus sesiones y el historial de
auditoría de F0-22, y quién puede cambiar esa lista. Había cinco preguntas abiertas: cómo se evita
que un email esté dos veces con otras mayúsculas, si cerrar una sesión viola la regla de "no hay
borrado físico", cómo se garantiza que `revocar` sea todo o nada, cómo se evita quedarse sin
administradores y cómo se crea el primero, si solo un administrador puede crear usuarios.

## Decisión

**Tres tablas nuevas en una migración, casos de uso que corren enteros en una transacción y un
primer administrador que crea `db:seed` por un camino aparte.**

- **Esquema** (`prisma/migrations/<marca>_usuarios_sesiones_auditoria/`):
  - `usuarios`: `id` uuid, `email` único, `nombre` (nulo hasta el primer ingreso, F0-31), `rol`
    (enum `rol_usuario`: `administrador | operador`), `estado` (enum `estado_usuario`:
    `activo | revocado`) y las columnas de `Auditable` (`creado_en`, `creado_por`,
    `actualizado_en`, `actualizado_por`, `eliminado_en`, `eliminado_por`). Los `*_por` guardan
    un `Actor` como `jsonb` (`{ tipo, usuarioId }` o `{ tipo, proceso }`): el primer
    administrador lo crea un proceso, no una persona, y una FK a `usuarios` no lo podría
    representar. Las fechas las pone el reloj inyectado, no la base (no hay `@updatedAt`).
  - `sesiones`: `id` texto (el token), `usuario_id` FK a `usuarios` con `ON DELETE CASCADE`,
    `creada_en`, `expira_en`, `ultimo_uso`, `agente` (nulo si no vino); índice por `usuario_id`.
  - `auditoria`: `id` uuid, `entidad`, `entidad_id` (texto: no toda entidad tiene id uuid),
    `accion`, `antes` y `despues` `jsonb` nulos, `actor` `jsonb`, `en` `timestamptz`; índice por
    `(entidad, entidad_id)`. El adaptador solo inserta.
  - `configuracion.actualizado_por` pasa a FK a `usuarios` (`ON DELETE RESTRICT`).
- **Email sin mayúsculas.** Se guarda siempre `trim` + minúsculas (lo normalizan los casos de uso
  y el adaptador, al escribir y al buscar), con índice único y un CHECK
  `usuarios_email_en_minusculas` (`email = lower(email)`) escrito a mano en `migration.sql`: la base
  rechaza una fila con mayúsculas aunque alguien la escriba sin pasar por el código. Prisma no
  modela los CHECK y el diff contra `schema.prisma` no los ve (el test de la cadena sigue verde).
  Un email repetido es `AUT-0005`; uno sin forma de email, `AUT-0007`.
- **Fechas en `timestamptz`.** `FechaHora` es civil y sin zona (ADR 0012). El adaptador la guarda
  como el instante que esa fecha es en la Argentina, con desplazamiento fijo `-03:00` (sin horario
  de verano), y la vuelta resta las tres horas: ida y vuelta dan la misma `FechaHora` sin
  depender de la zona de la máquina (`src/adaptadores/prisma/conversiones.ts`).
- **Las sesiones sí se borran.** Una sesión no es un dato de negocio: es una credencial (su `id`
  es lo que lleva la cookie). Una credencial "marcada como cerrada" pero guardada es una
  credencial que alguien puede volver a aceptar por error; quitarla es la forma segura de
  cerrarla. La regla 16 de `AGENTS.md` (sin borrado físico) es para los datos de negocio. El
  método se llama `cerrarTodasDe(usuarioId)`, que no empieza con `eliminar/borrar/delete/…`: el
  test de F0-22 que recorre `src/puertos/**` sigue verde sin excepciones. Qué se hizo con el
  usuario queda en la auditoría.
- **Token de sesión.** 32 bytes (256 bits) de `randomBytes` de `node:crypto`, en base64url sin
  relleno (43 caracteres). Lo genera el adaptador al abrir la sesión.
- **Transacción.** Un puerto `Transaccional` (`src/puertos/repositorios/transaccion.ts`) corre un
  trabajo contra los tres repositorios atados a una `$transaction` interactiva de Prisma. Los
  tres casos de uso corren enteros adentro: `revocar` pone `estado = revocado`, cierra todas las
  sesiones y escribe la auditoría, y si cualquiera de los pasos falla no queda nada. El test lo
  prueba forzando la falla en la auditoría, después de cerrar las sesiones.
- **Autorización.** Solo una **persona** con usuario **administrador** y **activo** (no revocado ni
  eliminado) ejecuta `darDeAlta`, `revocar` o `cambiarRol`; si no, `AUT-0003` y nada cambia. Un
  actor `sistema` no administra usuarios.
- **El último administrador.** Revocar o pasar a operador al único administrador activo es
  `AUT-0004`, sea uno mismo o sea otro. `revocar` y `cambiarRol` empiezan con
  `bloquearAdministradoresActivos()` (`select … for update`): dos cambios simultáneos se ordenan,
  y el segundo ve el resultado del primero. Sin el bloqueo, dos administradores que se revocan uno
  al otro al mismo tiempo dejarían el sistema sin ninguno (hay un test que lo cruza).
- **Revocar no es borrar.** En la auditoría, revocar es una `actualizar` (de `estado: activo` a
  `revocado`): el usuario sigue guardado y `accion: "eliminar"` exige un borrado lógico que acá
  no hay. Revocar a un revocado o cambiar al mismo rol no cambia nada ni audita.
- **El primer administrador.** Lo crea `npm run db:seed` desde `ADMIN_INICIAL_EMAIL` (obligatoria
  en el esquema de entorno, formato email), con el actor de sistema `db-seed` y su registro de
  auditoría, **si no hay ningún usuario con ese email**. Si ya existe (con cualquier rol o
  estado), no lo toca: la semilla no reactiva a un revocado. No pasa por `darDeAlta`, que exige
  un administrador: es el único usuario que no crea otro administrador.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Índice único sobre `lower(email)` (o el tipo `citext`) | Prisma no modela índices por expresión ni tiene `citext` sin extensión: el diff contra `schema.prisma` los marcaría o los perdería, y el control de drift (ADR 0011) quedaría en rojo. Guardar en minúsculas con índice único común y un CHECK da lo mismo |
| `creado_por`/`actualizado_por` como FK uuid a `usuarios` | No puede representar un actor de sistema (la semilla, más adelante el worker): habría que inventar un usuario "sistema" que entra a la lista blanca |
| Sesiones con `cerrada_en` en vez de borrarlas | Deja credenciales viejas en la tabla, que cada lectura tiene que acordarse de filtrar: un olvido acepta una sesión cerrada |
| Id de sesión uuid (`gen_random_uuid()`) | 122 bits aleatorios y forma reconocible; el token de una cookie de sesión se genera con 256 bits de un generador criptográfico |
| Transacción con aislamiento `SERIALIZABLE` en vez del bloqueo | Resuelve el "último administrador" pero hace fallar con error de serialización cualquier cruce, que hay que reintentar; el `for update` solo ordena los cambios que tocan administradores |
| Que `darDeAlta` acepte un actor `sistema` para la semilla | Abre la puerta a que cualquier proceso cree administradores; el primer administrador es un caso único y va por su propio camino |

## Consecuencias

- La lista blanca, las sesiones y la auditoría quedan persistidas; F0-31 (login) y F0-32
  (pantallas) usan estos puertos sin cambiar el esquema.
- `ADMIN_INICIAL_EMAIL` es obligatoria: sin ella no arranca la app ni ningún script de base. Está
  en `.env.example` (inventada), en CI, en el servicio e2e de compose y en `imagen:prueba`; en el
  servidor hay que ponerla antes del primer `db:seed` (RUNBOOK).
- Lo hacen cumplir: `tests/casos-uso/usuarios-casos-uso.test.ts` (reglas a–d, transacción,
  concurrencia), `tests/casos-uso/usuarios-repositorios.test.ts` (email, CHECK, token, auditoría
  que solo agrega), `tests/casos-uso/usuarios-semilla.test.ts`, `tests/casos-uso/migraciones.test.ts`
  (la migración y su `down.sql`) y `tests/dominio/puertos-sin-borrado.test.ts`.
- Códigos nuevos en el catálogo: `AUT-0001` a `AUT-0004` (los que cita el plan) y `AUT-0005` a
  `AUT-0007` (email repetido, usuario inexistente, email inválido).
- Toda la hora que entra y sale de la base se interpreta como hora argentina. Si algún día hay
  que operar en otra zona, se cambia en `conversiones.ts` (ADR 0012 ya lo anticipa).

## Cómo se revierte

La migración tiene su `down.sql` (`npm run db:migrate:down` en local). El código está encapsulado
en `src/puertos/repositorios/`, `src/adaptadores/prisma/{usuarios,sesiones,auditoria,transaccion,
conversiones}.ts`, `src/casos-uso/usuarios/` y `sembrarAdministradorInicial` de `prisma/seed.ts`;
cambiar una decisión puntual (por ejemplo, sesiones con `cerrada_en`) toca el adaptador, el puerto
y una migración nueva, no los casos de uso de otras tareas.
