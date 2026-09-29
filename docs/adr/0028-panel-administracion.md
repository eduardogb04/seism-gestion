# ADR 0028 — Panel de administración: protección por rol en cada página, corte inmediato de la sesión revocada y Server Actions sin JavaScript de cliente

> Archivo: `docs/adr/0028-panel-administracion.md`. Numeración correlativa, nunca se reutiliza.

**Fecha:** 2026-09-29
**Estado:** Propuesto
**Tarea:** F0-32
**Decide:** el plan (F0-32); los detalles de abajo los fijó el orquestador de la tarea

## Contexto

El administrador da de alta y de baja usuarios desde la pantalla, sin tocar la base
(`/administracion/usuarios`), y `/salud` (F0-26) tiene que quedar detrás de la misma protección.
Tres cosas había que decidir: **dónde** se exige el rol (Next no vuelve a renderizar un layout al
navegar dentro de un segmento, y un layout que "esconde" a sus hijos no impide que corran ni que
sus datos viajen), **cuándo** deja de valer la sesión de alguien a quien se revoca (la caché de
sesiones de F0-31 dura hasta 30 s, y el criterio pide que la *siguiente* request sea rechazada) y
**cómo** se arman las pantallas sin JavaScript de cliente propio.

## Decisión

**1. La protección es una llamada en cada página, antes de leer ningún dato.**
`accesoDeAdministrador()` (`src/app/(auth)/sesion-actual.ts`) valida la sesión contra la base y
decide (`evaluarAccesoDeAdministrador`, `src/casos-uso/sesion/acceso.ts`, pura): sin sesión
redirige a `/ingresar/error?codigo=AUT-0002`; con una persona que no es administradora devuelve
`prohibido` y la página muestra `AUT-0003` (código, descripción y qué hacer del catálogo) sin
ningún dato; si es administradora devuelve `permitido` con su `Actor`. Toda `page.tsx` de
`src/app/administracion/**` la llama con `await`, antes de `armado()`; un test recorre el
directorio y falla si una página no lo hace (`tests/dominio/proteccion-administracion.test.ts`).
`/salud` (F0-26) la usa igual desde su primera línea. `/api/salud` **no** la usa: es el latido del
deploy (P13) y sigue público, con un test que lo afirma.

**2. Las acciones de escritura no confían en la pantalla.** Cada Server Action
(`src/app/administracion/usuarios/acciones.ts`) toma el `Actor` **solo** de la sesión validada
(`actorDesdeSesion()`, con `actorDeSesion` en `src/casos-uso/sesion/acceso.ts`): ningún campo del
formulario aporta el actor ni el rol de quien actúa. Valida lo que llega con Zod
(`src/casos-uso/usuarios/formularios.ts`; un rol que no es de `ROLES`, un id que no es UUID o un
email que no es texto es `AUT-0008`, nuevo en el catálogo) y deja que el caso de uso decida si esa
persona puede (`AUT-0003`, F0-30). Esconder un botón no protege nada. Termina siempre en una
redirección a la lista, con `?error=<código>` si algo se rechazó; el texto sale del catálogo.
F0-33 formaliza esta regla para todo el sistema a partir de `actorDesdeSesion()`.

**3. Revocar y cambiar el rol invalidan la caché de sesiones de ese usuario en el mismo
proceso.** `CasosUsoSesion.invalidarUsuario(usuarioId)` saca sus entradas de la caché;
`revocar` y `cambiarRol` (`src/casos-uso/usuarios/`) la llaman **después** de confirmar la
transacción (la base ya cerró las sesiones y cambió el estado o el rol). El punto de armado le pasa
a los casos de uso de usuarios los de sesión, que son los que tienen la caché. Resultado: revocar y
validar enseguida es `AUT-0002`, sin esperar los 30 s (test de caso de uso con reloj fijo y e2e con
la cookie todavía puesta). Cambiar el rol también invalida, para que el panel no siga mostrando el
rol viejo hasta 30 s.

**Límite conocido.** La caché es **por proceso**. Con más de un proceso web (hoy hay uno), la
invalidación de un proceso no llega a los otros y una sesión revocada seguiría valiendo hasta 30 s
en ellos; ahí la invalidación tendría que pasar por la base (por ejemplo, consultar el estado del
usuario en cada request de una acción de escritura, o una marca de versión por usuario). Las
acciones de escritura ya están cubiertas sin caché: el caso de uso lee al actor de la base en cada
llamada. También queda una ventana de una request en vuelo: una validación que leyó la base antes
de la revocación puede volver a poblar la caché justo después de invalidarla.

**4. Server Components y Server Actions, formularios HTML.** Sin `"use client"` propio ni librerías
de UI (un test lo verifica sobre `src/app/administracion/**`). El rol es un `<select>` de `ROLES`
(`src/casos-uso/usuarios/roles.ts`), nunca texto libre; el email lo normaliza y valida `darDeAlta`
(minúsculas, sin espacios, `AUT-0007`).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Proteger solo en un `layout.tsx` de `/administracion` | Next no lo vuelve a renderizar al navegar entre páginas del segmento, y un layout no impide que la página corra ni que sus datos entren al payload RSC (guía de autenticación de Next 16) |
| Decidir por el rol que dice la cookie o un campo oculto | Un dato del cliente no es una sesión: el rol sale de la sesión validada contra la base |
| Esperar los 30 s de la caché en el e2e, o bajar la caché a 0 | Lo primero hace lento y frágil el e2e y no cumple "la siguiente request"; lo segundo consulta la base en cada request de toda la app por una regla que solo importa al revocar |
| Invalidar por la base (marca de versión por usuario) desde ya | Hoy hay un solo proceso web; agregar un mecanismo que nadie necesita todavía. Queda anotado como salida cuando haya más de uno |
| `useActionState` para mostrar el error en la misma página | Exige un componente de cliente (JavaScript propio). Con redirección y `?error=` alcanza y funciona sin JavaScript |
| Middleware/`proxy.ts` para toda la protección | Corre antes de la página pero no reemplaza el chequeo junto a los datos; sumaría un segundo lugar que mantener |

## Consecuencias

- Un operador (o un proceso) que arma el POST a mano no cambia nada: lo frena el caso de uso.
- Cada página nueva bajo `/administracion/**` (y `/salud`) tiene que llamar a
  `accesoDeAdministrador()`; lo hace cumplir `tests/dominio/proteccion-administracion.test.ts` y lo
  explica `AGENTS.md` (*Cómo se agrega... una página que exige administrador*).
- Un error nuevo en el catálogo: `AUT-0008`.
- `RepositorioUsuarios` suma `listar()` (todos, también los revocados, por email).
- Con más de un proceso web hay que cambiar el punto 3 (ver el límite).

## Cómo se revierte

Sacar `sesiones` de `DependenciasUsuarios` y las dos llamadas a `invalidarUsuario` devuelve el
corte a "hasta 30 s"; borrar `src/app/administracion/` deja el sistema como en F0-31. La protección
y el actor viven en `sesion-actual.ts` y `acceso.ts`, que no dependen de las pantallas.
