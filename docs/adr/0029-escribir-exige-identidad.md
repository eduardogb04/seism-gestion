# ADR 0029 — Escribir exige identidad, por tipos: `Actor` primero en casos de uso y repositorios, y la auditoría la escribe el adaptador

> Archivo: `docs/adr/0029-escribir-exige-identidad.md`. Numeración correlativa, nunca se reutiliza.

**Fecha:** 2026-09-29
**Estado:** Propuesto
**Tarea:** F0-33
**Decide:** el plan (F0-33); los detalles de abajo los fijó el orquestador de la tarea

## Contexto

*"Es imposible escribir en el sistema sin identidad, obligado por tipos y no por disciplina."* Desde
F0-30 los casos de uso de usuarios ya reciben un `Actor`, pero nada impedía que el próximo caso de
uso, o un repositorio, lo olvidara: la regla vivía en la memoria de quien escribía. Además, quien
escribía la auditoría era el caso de uso (`repos.auditoria.registrar(...)`), así que un repositorio
podía guardar un dato sin dejar rastro de quién lo hizo. Había que mover la obligación al
compilador y a tests que fallen solos.

## Decisión

**1. Todo caso de uso que escribe recibe `actor: Actor` como primer parámetro obligatorio.** "Escribe"
es un nombre exportado —función, o miembro de un `type`/`interface` exportado— que empieza con
`crear`, `guardar`, `dar`, `revocar`, `cambiar`, `marcar` o `registrar`. En este repo los casos de
uso son métodos de un objeto que arma una fábrica (`crearCasosUsoUsuarios`), así que el chequeo mira
los miembros de los tipos, no solo las funciones sueltas. Las fábricas `crearCasosUso*` no escriben
y están en una lista de excepciones explícita, con su motivo, dentro del test.

**2. Los métodos de escritura de los repositorios de entidades reciben `actor` primero y el
adaptador escribe la auditoría.** `RepositorioUsuarios.crear(actor, usuario)` y
`.actualizar(actor, usuario, accion)` (los `guardar` y `marcarEliminado` del plan son nombres
genéricos: en el repo son estos). El adaptador Prisma escribe la fila de `auditoria` con el mismo
cliente, o sea en la misma transacción, con el `actor` recibido; el `antes` de una actualización es
lo que la base tenía justo antes de escribir, y la fecha es la de la propia fila
(`creadoEn`/`actualizadoEn`, que el caso de uso armó con el reloj inyectado). Los casos de uso
dejan de llamar a `auditoria.registrar` para usuarios, y `RepositoriosEnTransaccion` ya no
expone `auditoria`. `accion` es un `AccionAuditoria` (`"crear" | "actualizar" | "eliminar"`), no un
`string` suelto.

**3. `RepositorioSesiones` queda fuera.** Una sesión es una credencial, no un dato de negocio
(ADR 0024): `abrir`, `cerrar` y `cerrarTodasDe` no llevan actor ni auditoría (la revocación del
usuario que las cierra sí queda auditada, por el repositorio de usuarios).

**4. En la app, el `Actor` sale solo de la sesión validada.** `actorDesdeSesion()` y
`accesoDeAdministrador()` (`src/app/(auth)/sesion-actual.ts`) son la única fuente; no hay forma de
armar un `Actor` de persona desde un formulario. El worker usa `{ tipo: "sistema", proceso }`
(`crearNombreProceso`); hoy no llama a ninguna escritura, y cuando lo haga el tipo le exige pasarlo.

**5. Cómo se hace cumplir**, todo en `tests/dominio/tipos/`:

- `escrituras-exigen-actor.test.ts`: cada caso de uso y cada método de repositorio se llama sin
  actor con `// @ts-expect-error`; `npm run typecheck` falla (`Unused '@ts-expect-error'
  directive`) si una firma pierde el actor.
- `firmas-de-escritura.test.ts`: recorre `src/casos-uso/**` con la API sintáctica de TypeScript y
  exige `Actor` en la primera posición de cada escritura; falla nombrando archivo y función, y falla
  si no encuentra ninguna (un glob roto no da verde vacío).
- `actor-solo-desde-la-sesion.test.ts`: recorre `src/app/**`; ningún archivo salvo
  `sesion-actual.ts` contiene `tipo: "persona"`, y toda Server Action llama a `actorDesdeSesion()` o
  `accesoDeAdministrador()`, directo o a través de una función del mismo archivo que lo haga (`ejecutar`
  en `acciones.ts`). Cierra el aviso de F0-32: el test de protección solo miraba `page.tsx`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Que el caso de uso siga escribiendo la auditoría | Un repositorio nuevo podría guardar sin auditar; con el adaptador escribiéndola, no hay forma de escribir sin dejar quién |
| `actor?: Actor` opcional, o una sobrecarga sin actor | Es exactamente lo que el criterio prohíbe: escribir sin identidad compilaría |
| Una regla de lint (Biome) en vez de tests | Biome no ve tipos ni miembros de tipos; los tests sintácticos y el compilador sí, y quedan probados con código en memoria |
| Auditar también las sesiones | Una sesión es una credencial: abrirla y cerrarla no es un dato de negocio (ADR 0024) |
| Exigir que cada Server Action llame a `actorDesdeSesion()` en su propio cuerpo | Obligaría a repetir el `try/catch` de `ejecutar` en cada acción; seguir la llamada por las funciones del mismo archivo mantiene lo que importa (el actor sale de la sesión) |

## Consecuencias

- Se gana: escribir sin actor no compila, y un repositorio no puede guardar sin dejar auditoría.
- Se pierde: un caso de uso de escritura nuevo hay que sumarlo a `escrituras-exigen-actor.test.ts`
  (la lista de firmas la detecta sola; la llamada sin actor con `@ts-expect-error` no).
- Un verbo de escritura fuera de la lista (`eliminar`, `agregar`...) no lo ve
  `firmas-de-escritura.test.ts`: la lista es la del plan y no se amplía sin una tarea que lo decida.
- Lo hacen cumplir: el compilador (`npm run typecheck`), `npm run test:dominio` y la revisión.

## Cómo se revierte

`crear` y `actualizar` vuelven a no recibir actor, la auditoría vuelve a los casos de uso
(`RepositoriosEnTransaccion.auditoria`) y se borran los tres tests de `tests/dominio/tipos/` y sus
ayudas en `tests/dominio/_arnes/`. No toca el esquema ni datos.

## Addendum 2026-09-30

Dos aclaraciones que salieron de la verificación de F0-33 (tarea M-07). No cambian la decisión.

**Los registros de sistema no reciben `Actor`.** `RepositorioUsoIa.registrar`
(`src/puertos/repositorios/uso-ia.ts`) y `RegistroCorridas.iniciar` / `.terminar`
(`src/puertos/repositorios/corridas-worker.ts`) quedan sin `Actor` a propósito. No son datos de
negocio: son **registros que el propio sistema lleva de lo que hace** (cuánto gastó la IA, cuándo
corrió cada job). Ninguna persona los escribe ni los cambia, no tienen `RegistroAuditoria` (no son
entidades) y el "quién" sería siempre el mismo proceso. Pedir un `Actor` ahí obligaría a inventar uno
`{ tipo: "sistema", proceso }` que no dice nada que el nombre del job o del perfil no diga ya. La
regla 18 sigue valiendo para todo lo que sí es dato de negocio. El test de firmas
(`tests/dominio/tipos/firmas-de-escritura.test.ts`) no cambia: recorre `src/casos-uso/**`, y estos
puertos son del sistema, no casos de uso de escritura.

**El test de Server Actions ve también las reexportaciones.** `actor-solo-desde-la-sesion.test.ts`
mira, además de `export async function f`, las acciones exportadas aparte con `export { f }`,
`export { f as g }` y `export default f` (o `export default async function`/flecha asíncrona), y exige
que también lleguen a `actorDesdeSesion()` o `accesoDeAdministrador()`. No resuelve
`export { f } from "./otro"`: una acción reexportada desde otro módulo se mira en el archivo donde
se define, que es el que lleva la directiva `"use server"`.
