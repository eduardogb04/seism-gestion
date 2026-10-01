# ADR 0031 — Molde de ABM: un ABM es una definición, no un juego de archivos

> Archivo: `docs/adr/0031-molde-de-abm.md`. Numeración correlativa, nunca se reutiliza.

**Fecha:** 2026-10-01
**Estado:** Propuesto
**Tarea:** F1-03
**Decide:** la spec de F1-03 (decisiones de diseño fijas) y el orquestador de la tarea (resoluciones R1 a R19 de la ficha)

## Contexto

El único ABM que existía (usuarios) se escribió a mano de punta a punta: puerto, adaptador, casos de uso, formularios, acciones y pantalla. Fase 1 trae varios catálogos (grupos, clientes, sitios, camiones, tipos de servicio) que hacen lo mismo: listar con búsqueda, dar de alta, editar y dar de baja, con auditoría. Repetir todo por entidad es lento y cada copia puede olvidarse de la auditoría, del permiso o del borrado lógico.

## Decisión

**Un ABM se declara una vez (`DefinicionAbm`) y el molde da el resto.** No cambia la arquitectura: cada pieza vive en la capa que ya le tocaba y `.dependency-cruiser.cjs` no se toca.

| Pieza | Dónde | Qué es por entidad |
|---|---|---|
| Forma de los datos | `src/puertos/repositorios/abm.ts`, `EntidadesAbm` | una entrada |
| Puerto | `RepositorioAbm<E>` en ese archivo, y **un** acceso `abm(entidad)` en `RepositoriosEnTransaccion` | nada |
| Definición | `src/casos-uso/abm/<entidad>.ts` (`DefinicionAbm<E>`) y su línea en `definiciones.ts` | un archivo |
| Casos de uso | `src/casos-uso/abm/abm.ts`: `listar`, `obtener`, `crear`, `guardar`, `marcarEliminado` | nada |
| Prisma | `src/adaptadores/prisma/abm/repositorio.ts` | una línea en `tablas.ts` |
| Pantallas | `src/app/catalogo/_abm/` (las cuatro páginas y las acciones) y `src/app/_ui/` (`ListadoAbm`, `FormularioAbm`) | cuatro `page.tsx` de pocas líneas y la entrada del menú |
| Base | modelo en `schema.prisma` con las columnas de auditable de `usuarios`, y su migración | modelo y migración |

**La definición** dice: entidad, cómo se nombra en pantalla, ruta, campos, validación (un esquema de Zod sobre los datos; el mensaje de cada regla es el que ve la persona), qué campos son únicos, por cuáles se busca y se ordena, y qué roles escriben (`rolesQueEscriben`).

**Quién escribe y quién ve.** El permiso se decide en el caso de uso, con el usuario del `Actor`: una persona activa con un rol de `rolesQueEscriben`, o `AUT-0003` (`exigirRol`, que generaliza el `exigirAdministrador` de usuarios). Ocultar los botones es además, no en vez de. Ver exige solo sesión de un usuario activo: toda `page.tsx` de `src/app/catalogo/**` llama a `sesionExigida()` antes que nada (lo recorre `tests/dominio/proteccion-administracion.test.ts`).

**Escritura y auditoría.** `crear`, `guardar` y `marcarEliminado` reciben el `Actor` primero y corren en una transacción (`Transaccional`); el repositorio deja la fila de `auditoria` con el mismo cliente de la transacción (`crearAuditoriaPrisma`), con la entidad de la definición, la acción y `antes`/`despues` con el `id` y los campos (y `eliminadoEn` en la baja). La baja es `marcarEliminado` del dominio: nunca quita la fila. Lo que la persona puede corregir (una validación, un único repetido) **vuelve** por campo; lo demás se lanza con su código (`DOM-0009`: no existe o está dado de baja).

**El tipado sobre Prisma: un genérico, sin `any` y sin pegamento por entidad.** Los delegados de Prisma (`tx.grupo`, ...) no comparten un tipo base. `TablaAbm<F>` (en `repositorio.ts`) describe, en función de la fila `F`, lo único que el molde usa de un delegado: `findMany`, `count`, `findFirst`, `findUnique`, `create` y `update`, con los argumentos que el molde arma. El delegado de cada modelo es asignable a ese tipo tal cual, así que `tablas.ts` lleva una línea por entidad (`crearRepositorioAbmPrisma(cliente, "Grupo", cliente.grupo)`) y el compilador comprueba tres cosas: que el modelo tenga las columnas de auditable, que acepte los `where`/`orderBy`/`data` del molde, y que sus datos coincidan con `EntidadesAbm`. Los filtros y el orden se arman con claves tipadas (`enColumna`), no con un literal de clave calculada, que TypeScript ensancha a `string`. No hay SQL a mano en el CRUD.

**Listado.** Búsqueda (contiene, sin distinguir mayúsculas, sobre las columnas declaradas), orden y paginado (25 por página) van en la consulta: `where`, `orderBy` (con el `id` de desempate), `skip`/`take` y un `count`. Los parámetros de la URL se validan con Zod y uno inválido cae a su valor por defecto.

**Tipos de campo (R4).** Hoy existen solo los que usa Grupos: `texto` (una línea) y `textoLargo` (varias líneas, opcional: vacío se guarda como `null`). `CampoAbm` es una unión discriminada por `tipo`: un tipo nuevo (número, fecha, opción, relación) es una variante más, con su conversión en `valorDeCampo` y su control en `FormularioAbm`. El criterio *"un campo de relación es siempre un selector"* queda para el primer ABM que tenga una relación.

**El formulario (R7).** `FormularioAbm` es el único componente de cliente de `src/app/_ui/` (`"use client"`, `useActionState` de React 19): la acción devuelve `{ escrito, errores, error? }` y el formulario se vuelve a mostrar con lo que la persona escribió, el mensaje al lado de cada campo y, si el error no es de un campo, el código del catálogo arriba. Con JavaScript apagado funciona igual: el formulario se envía entero y Next devuelve la página renderizada con ese estado (lo prueba el e2e). Las acciones (`src/app/catalogo/_abm/acciones.ts`) son las mismas para todas las entidades: reciben atado el **nombre** de la entidad, no la definición (que lleva su validación y no viaja al navegador), y lo buscan en `definiciones.ts`; uno que no existe es `DOM-0009`. La baja no usa diálogo ni JavaScript: es una página de confirmación (`/<ruta>/[id]/baja`).

**Único (R8).** Entre los no eliminados, sin espacios en los extremos y sin distinguir mayúsculas; el valor de un registro dado de baja se puede volver a usar. Dos capas:

1. el caso de uso lo verifica dentro de la transacción (`buscarPorValor`) y devuelve `DOM-0008` al lado del campo;
2. **lo garantiza la base**, con un índice único parcial sobre `lower(columna)` y `WHERE eliminado_en IS NULL`, escrito a mano en la migración de la entidad. Prisma 7.10 no declara índices sobre expresiones en `schema.prisma`, pero tampoco los ve como diferencia: `prisma migrate diff` sigue vacío (control de drift y test de migraciones en verde). Si dos altas simultáneas esquivan la verificación, la segunda choca con el índice y el adaptador lanza `DOM-0008` (sin campo: se muestra arriba del formulario, con lo escrito).

Los espacios de los extremos los quita la validación (`.trim()`) antes de guardar; el índice no los vuelve a quitar.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un repositorio y casos de uso por entidad, como usuarios | Es el camino lento que la tarea viene a cortar; cada copia puede olvidarse de la auditoría o del permiso |
| Datos sin tipo (`Record<string, string \| null>`) en el puerto y un pegamento por entidad que convierta campo por campo | Repite los campos en tres lugares y un campo mal escrito falla al correr, no al compilar |
| Un `any` (o `as unknown as`) para tratar igual a todos los delegados de Prisma | Prohibido por la spec y pierde la comprobación de que el modelo coincide con la definición |
| SQL armado a mano para buscar, ordenar y paginar | Prohibido por la spec; Prisma ya lo resuelve con tipos |
| `@unique` simple sobre la columna | Cuenta los eliminados (el nombre de un grupo dado de baja no se podría volver a usar) y distingue mayúsculas |
| Único solo en el caso de uso | Dos altas simultáneas pasan las dos; el índice lo cierra sin costo |
| Una ruta dinámica `/catalogo/[entidad]` sin páginas por entidad | La spec fija las rutas y las páginas por entidad; además el control de acceso se recorre página por página |
| Un diálogo de confirmación con JavaScript | Una página de confirmación hace lo mismo sin JavaScript ni un componente nuevo |

## Consecuencias

- Un ABM nuevo cuesta: la entrada de `EntidadesAbm`, la definición, el modelo con su migración (y el índice único de cada campo único), una línea en `tablas.ts`, otra en `definiciones.ts`, cuatro `page.tsx` y la entrada del menú. Si falta la línea de `tablas.ts` o la de `definiciones.ts`, no compila. Para Grupos, el pegamento fuera de definición, esquema y semilla quedó en unas 40 líneas.
- Los tests del molde corren una vez, con Grupos (`tests/casos-uso/abm.test.ts`, `abm-acciones.test.ts`, `tests/e2e/grupos.spec.ts`): un ABM nuevo no los repite, prueba lo que tenga de propio.
- El índice único de cada campo único **no** lo declara `schema.prisma`: hay que escribirlo a mano en la migración. Si se olvida, queda solo la verificación del caso de uso (dos altas simultáneas podrían repetir el valor). Lo cuida la revisión, con *Cómo se agrega un ABM* de `AGENTS.md`.
- `src/app/_ui/` deja de ser solo HTML del servidor: `formulario-abm.tsx` es de cliente, y `tests/dominio/marco.test.ts` exige que sea el único.
- Todos los datos de un ABM son hoy texto (`string` o `string | null`). El primer ABM con otro tipo de campo extiende `CampoAbm`, `valorDeCampo`, `escritoDe`, el filtro de búsqueda y el control del formulario.
- La pantalla de usuarios no se migra al molde: tiene reglas propias (roles, revocación, sesiones).

## Cómo se revierte

Una entidad puede salir del molde sin tocar a las demás: se le escribe su puerto, su adaptador y sus pantallas, y se quitan su entrada de `EntidadesAbm`, `tablas.ts` y `definiciones.ts`; la tabla y sus datos no cambian. Sacar el molde entero es borrar `src/casos-uso/abm/`, `src/adaptadores/prisma/abm/`, `src/puertos/repositorios/abm.ts`, `src/app/catalogo/_abm/` y los dos componentes de `_ui/`, y quitar `abm` de `RepositoriosEnTransaccion`.
