# AGENTS.md — instrucciones para agentes

> Puerta de entrada de cualquier agente (Claude Code, Codex, otro) y de cualquier persona que
> clone este repo. Si algo de acá contradice otro documento del repo, manda esto; si esto calla,
> manda el ADR correspondiente en `docs/adr/`; si nada dice, se pregunta antes de hacer.
>
> *Escrito en F0-01. Cada tarea de Fase 0 la amplía en su mismo PR.*

## Qué es este repo

Sistema de gestión de operaciones para una consultora chica de servicios a la minería: registra
servicios, ejecuciones, vencimientos, documentos e ingresos y egresos, y avisa antes de que las
cosas pasen. Monolito modular en TypeScript de punta a punta: Next.js, PostgreSQL, Prisma, con un
worker aparte para ingestas y tareas programadas. Lo construyen agentes; una persona con criterio
de negocio verifica los cortes.

**Este repositorio es público.** Ver *Reglas no negociables*, la primera.

**Estado (F0-02):** TypeScript severo, un test de humo, Biome como formato y lint, y los scripts
que va a tener el proyecto (algunos todavía son placeholders — ver *Comandos*). Next.js (F0-04),
dependency-cruiser (F0-03), Postgres/Prisma (F0-08) y CI (F0-05) todavía no existen.

## Leer primero

1. Este archivo, entero.
2. `README.md` — cómo se levanta.
3. `docs/adr/` — las decisiones y por qué. No se reabren sin un ADR nuevo.
4. La spec de la tarea que te toca (`docs/specs/` o la que te pasaron).
5. `RUNBOOK.md` solo si tu tarea toca infraestructura o deja un paso manual.

(`docs/arquitectura.md` todavía no existe: lo agrega F0-03.)

## Comandos

Solo los que existen hoy. La tabla crece en cada tarea que suma una herramienta real.

| Comando | Qué hace hoy |
|---|---|
| `npm run dev` | **Placeholder.** Imprime qué tarea trae la herramienta (F0-04) y sale 0 |
| `npm run build` | **Placeholder.** Ídem (F0-04) |
| `npm run lint` | `biome check .` — Biome en modo verificación (lint + formato) sobre `src/`, `tests/` (menos `tests/fixtures/`), `scripts/` y los archivos de config de la raíz. `-- --write` aplica los arreglos |
| `npm test` | Vitest sobre `tests/dominio/` (hoy: el test de humo) |
| `npm run typecheck` | `tsc --noEmit` (TypeScript severo) y después `scripts/sin-any.ts`, que rechaza cualquier `any` explícito (TypeScript no tiene opción de compilador para eso — ver ADR 0002) |
| `npm run typecheck:fixtures` | Prueba negativa de lo anterior: corre el mismo chequeo sobre `tests/fixtures/typecheck/*.ts`, que **tienen** que ser rechazados. Sale 0 si los rechazó a todos, 1 si aceptó alguno |
| `npm run lint:fixtures` | Prueba negativa de `lint`: corre Biome sobre `tests/fixtures/lint/debe-fallar.ts`, que **tiene** que ser rechazado por `noExplicitAny` **y** `noUnusedVariables`. Sale 0 si Biome lo rechazó con las dos reglas, 1 si lo aceptó o si falta alguna |
| `npm run db:migrate` | **Sale 1** con mensaje claro: no hay esquema ni Prisma hasta F0-08 |

Antes de abrir un PR: `npm run typecheck && npm run lint && npm test && npm run typecheck:fixtures
&& npm run lint:fixtures`. (`limites` se suma a esta línea cuando deje de ser placeholder, en
F0-03.)

## Formato y lint

Biome (`biome.json`, raíz del repo) hace las dos cosas en una sola herramienta: formato y lint.
`npm run lint` corre `biome check .`, que es **verificación**, no escribe nada; agregando
`-- --write` aplica formato y los arreglos seguros de lint.

- **Alcance.** `src/`, `tests/` (menos `tests/fixtures/`, que un lint normal no puede tocar — es
  donde viven los fixtures que **tienen** que fallar), `scripts/` y los archivos de config de la
  raíz (`*.ts`, `*.json`, menos `package-lock.json`). `.next/` y `next-env.d.ts` quedan afuera
  desde ya (riesgo anotado en el plan: cuando exista Next.js en F0-04, esos archivos generados
  pueden no coincidir con el formato de Biome).
- **Reglas en `error`, ninguna en `warn`.** Biome trae reglas de `recommended` con severidad mixta
  (`warn` en varias, `error` en otras) — un lint que solo emite `warn` no hace fallar `biome
  check` y no cumple el criterio. `biome.json` fija en `"error"`, rule por rule, las que
  `recommended` deja en `warn` o `info`, más las cinco que pide el criterio de F0-02
  (`noExplicitAny`, `noUnusedVariables`, `noUnusedImports`, `noNonNullAssertion`, `useConst`).
  `a11y` y `security` ya vienen en `error` en `recommended`, sin overrides. Ver ADR 0003 (por qué
  no alcanza con `--error-on-warnings`, y qué revisar si Dependabot sube la versión de Biome).
- **Prueba de que rechaza.** `tests/fixtures/lint/debe-fallar.ts` tiene un `any` explícito y una
  variable sin usar (dos reglas independientes, para que el rechazo de una no tape que la otra
  dejó de andar). Como el lint normal excluye `tests/fixtures/`, esa carpeta tiene su propio
  `biome.json` (`"root": true`, no hereda nada de la raíz) solo con esas dos reglas. `npm run
  lint:fixtures` (`scripts/lint-fixtures.ts`) invoca el binario de Biome con `cwd` en esa carpeta,
  imprime su salida de error, e **invierte** el código de salida: sale 0 si Biome rechazó el
  fixture y aparecen los diagnósticos de las dos reglas, 1 si lo aceptó o si falta alguno de los
  dos.
- **`// biome-ignore` exige motivo.** Ninguno sin explicar por qué en el mismo comentario. Si
  Biome choca con código real, se arregla el código, no la regla.

## Reglas no negociables

Las hace cumplir la máquina donde se puede; donde no, la revisión.

1. **Nada real en el repo.** Ni datos de la empresa, de clientes, de personas, ni montos, ni
   documentos de negocio, ni secretos, ni `.env`. Las semillas y los tests usan datos
   **ficticios**. El repo es público: lo que entra queda indexado en minutos. Si dudás, no entra.
2. **El dominio no importa infraestructura.** `src/dominio` solo importa de `src/dominio`.
   dependency-cruiser lo va a hacer cumplir desde F0-03; hasta entonces, revisión.
3. **El reloj se inyecta.** Cero llamadas a la fecha del sistema en el dominio. Biome lo va a
   hacer cumplir desde F0-18/F0-19 (dominio todavía no existe).
4. **Nada de `any`.** `tsc --noEmit` (TypeScript severo) frena el implícito; `scripts/sin-any.ts`
   frena el explícito — es lo que corre `npm run typecheck` (ver ADR 0002). Biome (`noExplicitAny`,
   `npm run lint`) es la segunda red.
5. **Todo borde externo se valida con Zod**, incluidas las variables de entorno al arrancar: si
   falta una, la app no arranca. (Llega en F0-04.)
6. **Todo error tiene código estable** del catálogo (`DOM-0001`). No existe `throw new Error`.
   (El catálogo llega en el lote 6.)
7. **Ningún log con secretos ni datos personales.** Hay un test dedicado. (Llega en F0-24.)
8. **La IA nunca escribe en el dominio.** Crea borradores o propone; un humano confirma.
9. **Un archivo que crece demasiado se parte.**
10. **Todo cambio de esquema es una migración con su `down.sql`.** Nadie toca la base a mano.
    (Aplica desde F0-08.)
11. **Todo paso manual va a `RUNBOOK.md`** en el mismo PR. Ninguna tarea cierra con uno sin
    documentar.
12. **Un cambio de arquitectura sin ADR no pasa revisión.**
13. **Todo entra por PR. CI en rojo = no se fusiona y no arranca ninguna tarea nueva.** (CI llega
    en F0-05; hasta entonces, "CI en verde" significa correr localmente los comandos de la sección
    *Comandos* y que todos den lo que tienen que dar.)
14. **Sin `TODO`, sin código muerto.** Lo que no se hace ahora, no se deja anotado en el código:
    se escribe como tarea.
15. **No hay configuración atada a ningún editor ni a ningún CLI de agente**, con una única
    excepción documentada: `CLAUDE.md` (ver ADR 0001). Ningún otro archivo de ese tipo entra al
    repo.

## Cómo se trabaja

```
spec  →  test que falla  →  implementación  →  verde  →  tester verifica criterios  →  merge
```

- **TDD en el dominio**: la regla se escribe como test antes que el código.
- **Una tarea = una rama = un PR.** Rama `f0-NN-titulo-corto`. Título del PR `F0-NN · Título`.
- **El PR describe cómo se verifica cada criterio de aceptación**, qué NO entró, qué paso manual
  quedó en RUNBOOK y qué ADR se escribió.
- **El que implementa no se aprueba.** Un tester distinto verifica los criterios.
- **Tamaño**: una tarea entra en una sesión y su diff se revisa de una sentada. Si no, se parte
  antes de empezar.

## Formato de una tarea (spec)

Contexto · Criterios de aceptación (observables y verificables) · Qué NO entra · Qué toca ·
Cómo se prueba · Riesgos.

## Definición de terminado

- [ ] Criterios de aceptación escritos antes de empezar, todos verdes
- [ ] Tests en el nivel que corresponde (dominio · casos de uso · e2e · extracción)
- [ ] CI entera en verde: typecheck, lint, límites, tests, migraciones (hasta F0-05: los mismos
      comandos, corridos a mano)
- [ ] Si tocó el esquema: migración con `down.sql` y el test que aplica y revierte
- [ ] Si cambió la arquitectura: ADR
- [ ] Si dejó un paso manual: `RUNBOOK.md`
- [ ] Si agregó un modo de fallar: error en el catálogo
- [ ] Sin `TODO`, sin código muerto, sin `any`
- [ ] El diff se revisa de una sentada
- [ ] Nada real en el diff (regla 1)

## Cómo se agrega...

*(Cada tarea de Fase 0 completa su sección acá.)*

**...un comando que todavía no tiene herramienta (F0-01).** Se apunta a
`scripts/pendiente.ts <comando> <tarea>` (imprime qué tarea lo trae y sale 0) o, si el comando
tiene que fallar hasta que exista su herramienta (como `db:migrate`), un script dedicado que sale
1 con un mensaje claro en castellano. Se reemplaza por la herramienta real en la tarea que
corresponda, sin dejar rastro del placeholder.

**...un fixture que una herramienta tiene que rechazar (F0-01).** Un archivo bajo
`tests/fixtures/<herramienta>/` que viola **una sola** regla, por lo demás válido. El script
`<herramienta>:fixtures` corre el chequeo real sobre el fixture e **invierte** el código de
salida: sale 0 si la herramienta lo rechazó (mostrando su salida de error, para que se vea que
rechaza a propósito), 1 si lo aceptó. `tests/fixtures/` está excluido del chequeo normal.
Excepción (F0-02, decisión del orquestador): `lint/debe-fallar.ts` viola **dos** reglas a
propósito (`noExplicitAny` y `noUnusedVariables`) y el script verifica que **las dos** aparezcan
en la salida, para que el rechazo de una no tape que la otra dejó de andar.

**...un ADR.** Archivo nuevo `docs/adr/NNNN-titulo-corto.md`, con la misma estructura que
`docs/adr/0001-excepcion-claude-md.md` y `docs/adr/0002-any-explicito-en-typecheck.md`: Contexto ·
Decisión · Alternativas descartadas · Consecuencias · Cómo se revierte. Numeración correlativa,
nunca se reutiliza, aunque el plan haya sugerido otro número para una tarea futura (el plan es una
estimación; el orden real de creación manda).

## Estructura

```
src/dominio          puro; solo importa de sí mismo (vacío hasta el lote 5)
src/casos-uso        orquesta dominio contra puertos (vacío hasta el lote 5)
src/puertos          interfaces (vacío hasta el lote 5)
src/adaptadores      implementaciones: prisma, disco, s3, identidad, dobles (vacío hasta F0-08)
src/infraestructura  entorno, log, arranque (vacío hasta F0-04)
src/app              Next.js; solo habla con casos-uso (vacío hasta F0-04)
src/worker           proceso aparte: planificador + jobs (vacío hasta el lote 6)
tests/               dominio · casos-uso · extraccion · e2e · contratos · fixtures
scripts/             utilidades de los comandos de package.json (sin-any.ts, etc.)
```

Cada carpeta de `src/` y `tests/` tiene su propio `README.md` explicando qué va a vivir ahí y
desde qué tarea.

## Nunca

- Commitear secretos, `.env`, datos reales, documentos de negocio.
- Push directo a `main`.
- Cambiar stack, arquitectura o dependencias sin ADR aprobado.
- Marcar algo como terminado sin evidencia del tester y CI en verde.
- Tocar el servidor a mano: todo por script y por workflow.
