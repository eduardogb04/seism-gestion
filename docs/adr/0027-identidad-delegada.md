# ADR 0027 — Identidad delegada en Google, detrás de un puerto

> Archivo: `docs/adr/0027-identidad-delegada.md`. Numeración correlativa, nunca se reutiliza.

**Fecha:** 2026-09-29
**Estado:** Propuesto
**Tarea:** F0-31
**Decide:** el plan (F0-31); los detalles de abajo los fijó el orquestador de la tarea

## Contexto

El sistema nunca guarda una contraseña: quién es una persona lo dice Google. Pero el negocio
decide quién entra (la tabla `usuarios`, ADR 0024), y el resto de la app no tiene que saber
qué proveedor hay detrás. Hace falta poder desarrollar, correr CI y el e2e sin Google.

## Decisión

Un puerto `src/puertos/identidad.ts` (`iniciarLogin`, `completarLogin` → `IdentidadVerificada`)
con dos adaptadores, elegidos por la variable `IDENTIDAD` en `src/infraestructura/arranque/`:

- **`identidad-google`** (`IDENTIDAD=google`): OIDC con `arctic` 3.7.0 (`state` y PKCE). El
  `id_token` se verifica con `node:crypto` contra las JWKS de Google, elegidas por `kid`: firma
  RS256, `iss`, `aud`, `exp` (con el reloj inyectado) y `email_verified === true`. Exige
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `APP_URL_PUBLICA`.
- **`identidad-falsa`** (`IDENTIDAD=falsa`): una pantalla que lista emails de prueba
  (`ADMIN_INICIAL_EMAIL` y dos `@ejemplo.test` inventados, uno de ellos sin usuario para ver el
  rebote). **El esquema Zod del entorno rechaza `IDENTIDAD=falsa` con `APP_ENTORNO=servidor`**:
  la app no arranca.

Flujo de sesión (`src/casos-uso/sesion/`): `completarSesion` rebota con `AUT-0001`, sin crear
nada, si el email (en minúsculas) no es un usuario activo; si lo es, crea la sesión (id de 256
bits, **12 horas** de vida). `validarSesion` va a la base en cada request con una **caché en
memoria de 30 s como máximo** (TTL con el reloj inyectado): un usuario revocado deja de validar
a más tardar 30 s después. Sesión inexistente o vencida: `AUT-0002`.

Cookie de sesión `seism_sesion`: `httpOnly; SameSite=Lax; Path=/`, y `Secure` siempre salvo con
`APP_ENTORNO=local` (`next dev` y el e2e corren sobre `http://localhost`, y el navegador no
guarda una cookie `Secure` que llega por http). El `state` y el verificador PKCE viajan en una
cookie temporal `seism_login` (`httpOnly`, 10 minutos, solo a `/ingresar`), que el callback
compara y borra.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `jose` / `jsonwebtoken` / `next-auth` | Una dependencia más para lo que `node:crypto` hace en pocas líneas; la verificación queda a la vista y con un test por cada rechazo |
| Sesión firmada sin ir a la base | Revocar no cortaría la sesión activa |
| Microsoft/Entra | Queda como un adaptador más del puerto, cuando haga falta; no entra en esta tarea |

## Consecuencias

- El resto del sistema no conoce a Google: cambiar de proveedor es un adaptador nuevo.
- Revocar un usuario corta su sesión en 30 s como máximo; a cambio, cada request cuesta una
  consulta cada 30 s por sesión.
- La caché es por proceso: con varias instancias, cada una tiene la suya (el tope de 30 s vale
  igual).
- Lo hacen cumplir: el test del esquema y de arranque (`tests/dominio/identidad-arranque.test.ts`),
  la suite de contrato, los tests de `verificar-id-token` y de sesión, y el e2e con el falso.
- El cartel "aplicación no verificada" de Google con cuentas personales aparece hasta tener
  Workspace; con pocos usuarios no molesta.

## Cómo se revierte

Sacar el adaptador de `src/adaptadores/identidad-google/` y la rama de `IDENTIDAD` en el punto de
armado; el puerto y los casos de uso de sesión no cambian.
