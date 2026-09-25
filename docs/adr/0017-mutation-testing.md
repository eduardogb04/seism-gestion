# ADR 0017 — Mutation testing sobre el dominio: Stryker, vitest fijado en 4.1.11, umbral provisorio

> Archivo: `docs/adr/0017-mutation-testing.md`. Numeración correlativa, nunca se reutiliza.
> Un ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se
> marca *Reemplazado por NNNN*.

**Fecha:** 2026-09-16
**Estado:** Propuesto
**Tarea:** F0-17
**Decide:** el plan (P2 y cimiento 4) fija Stryker, solo sobre `src/dominio`, en workflow semanal
aparte que no bloquea merges, con el umbral inicial anotado a partir de una corrida real; el
orquestador resolvió antes de esta tarea que la corrida semanal va los lunes, a mano, en su propio
`mutacion.yml`, fuera del check `ci`, y que el umbral definitivo (no el de esta tarea) se fija en
el cierre del lote 5; el dev resuelve acá un problema que ninguno de los dos podía prever sin
correr la herramienta: `@stryker-mutator/vitest-runner` no detecta mutantes con `vitest` 5.x. El
orquestador aprobó fijar `vitest` en `4.1.11` para todo el repo y pidió sumar el `ignore` de
majors en `dependabot.yml` (mismo patrón que `typescript`/`@types/node`) y rebasar sobre F0-15/F0-16
una vez fusionados, actualizando el umbral si el puntaje cambiaba con las propiedades nuevas de
F0-15 (cambió: subió).

## Contexto

*"Es la única forma de saber si los tests sirven o solo dan verde"* (plan, F0-17). El criterio
transversal de la sección 7 de DISENO es más estricto todavía: *"cada herramienta entra con una
prueba que falla si la herramienta no está haciendo su trabajo"*. Para mutation testing esa prueba
es la corrida real que este ADR documenta — y esa misma corrida real fue la que encontró que la
herramienta, tal como se instala hoy, **no** hace su trabajo con la versión de `vitest` que ya
tenía el repo.

## Decisión

**Stryker (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`, ambos en `10.0.0` exacto)
como `devDependency`, mutando solo `src/dominio/**` (P2), con Vitest como motor de test.**

- `stryker.config.mjs`: `testRunner: "vitest"`, apuntado a `stryker.vitest.config.ts` en vez de al
  `vitest.config.ts` de la aplicación. Ese archivo aparte declara **un solo** proyecto de Vitest
  (el nivel `dominio`: mismo `include` y mismo arnés sin red que `vitest.config.ts`), para que
  Stryker no tenga ningún motivo para tocar el `globalSetup` de `casos-uso` (Testcontainers) ni
  nada de `extraccion` — mutar el dominio no necesita Docker.
- `npm run test:mutacion` (`stryker run`) corre a mano. `.github/workflows/mutacion.yml` la corre
  además los lunes (`schedule`) y a pedido (`workflow_dispatch`), **fuera** del job `ci`: el
  ruleset de `main` (F0-06) solo exige el check `ci`, así que esta corrida nunca bloquea un merge.
  Si el puntaje cae debajo del umbral, Stryker sale con código de error y el workflow queda en
  rojo — visible en *Actions*, sin frenar ningún PR — y el informe HTML queda como artefacto
  (`reports/mutacion/`, 30 días de retención) para ver qué mutante sobrevivió.
- **Hallazgo no previsto: `@stryker-mutator/vitest-runner@10.0.0` no activa los mutantes con
  `vitest@5.0.0`/`5.0.1`.** La primera corrida real dio un puntaje de **5.74 %** sobre el dominio
  actual (`reloj.ts`, `identificador.ts`, `historial.ts`), a todas luces incorrecto: se verificó a
  mano que una de las mutaciones marcadas *"survived"* (`dia ?? ""` → `dia && ""` en
  `parsearISO`) **sí** hace fallar `npm run test:dominio` corrido normalmente. El mecanismo de
  activación del mutante (`ns.activeMutant`, inyectado por Stryker vía `provide`/`inject` de
  Vitest en cada corrida) no se está aplicando para la enorme mayoría de los mutantes bajo
  `vitest` 5.x. Repitiendo la misma corrida solo con `vitest` en `4.1.11` (instalado aparte, sin
  tocar nada más) el puntaje sube a **87.73 %**, con exactamente los mismos tests y el mismo
  código: confirma que el problema es la combinación de versiones, no los tests ni la
  instrumentación de Stryker sobre el código. Encaja con las fechas de publicación en npm:
  `@stryker-mutator/vitest-runner@10.0.0` salió el 2026-08-14; `vitest@5.0.0` salió después, el
  2026-09-03 — el plugin no pudo haberse probado contra una versión de `vitest` que todavía no
  existía.
- **Se fija `vitest` en `4.1.11` exacto** (antes `^5.0.0`) en el `package.json` del repo entero,
  no solo para Stryker: no hay forma de darle a `@stryker-mutator/vitest-runner` una copia propia
  de `vitest` sin dársela también al resto del proyecto (ver *Alternativas descartadas*). Se
  verificó que los cuatro niveles de test, `typecheck`, `lint`, `limites`, los tres scripts
  `*:fixtures` y `npm run build` siguen en verde con `vitest` en `4.1.11` (misma sintaxis de
  `test.projects` que ya usaba `vitest.config.ts` desde F0-14).
- **Umbral provisorio (`thresholds.break`): 88.** Puntaje real de la corrida del 2026-09-16 sobre
  el dominio tal como está hoy (F0-18 reloj, F0-19 identificador, F0-21 historial; faltan F0-20
  importe y F0-22 origen/auditoría), redondeado hacia abajo. La primera corrida, antes de que
  F0-15 (fast-check) fusionara, dio 87.73 % → 87. Al rebasar sobre `main` con F0-15 y F0-16 ya
  fusionados, las propiedades nuevas de fast-check sobre `identificador.ts` matan cuatro mutantes
  más que las propiedades con generador propio que reemplazan: el puntaje subió a **88.92 % → 88**
  (repetido dos veces, mismo número las dos). `high: 90`, `low: 70` son los umbrales de color del
  informe HTML, sin pedido explícito del plan; se fijan cerca del puntaje real para que el informe
  sea legible desde ya. El umbral inicial **definitivo** (no este) se fija en el cierre del lote 5,
  sobre el dominio completo, y desde ahí solo sube: nunca baja (resuelto por el orquestador, no por
  este ADR).
- **`dependabot.yml` ignora majors de `vitest`**, mismo patrón que `typescript` y `@types/node`:
  mientras `@stryker-mutator/vitest-runner` no declare soporte para `vitest` 5.x, un PR de
  Dependabot proponiendo subirlo repetiría el problema de este ADR sin que nadie lo pida a
  propósito.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Aceptar el 5.74 % de la corrida con `vitest` 5.x como puntaje real | Se verificó a mano que es incorrecto (una mutación que sí rompe los tests aparece como *"survived"*). Fijar un umbral sobre un número que no mide lo que dice medir contradice el criterio que le da sentido a esta tarea |
| `overrides` de npm para darle a `@stryker-mutator/vitest-runner` su propio `vitest@4.1.11`, sin tocar el del resto del proyecto | `vitest` es una `peerDependency` de `@stryker-mutator/vitest-runner`, no una dependencia normal: npm no arma una copia anidada distinta cuando el proyecto raíz ya declara su propia versión de esa misma dependencia — `npm install` rechaza el conflicto (*"Conflicting peer dependency"*) en vez de resolverlo |
| Esperar una versión de `@stryker-mutator/vitest-runner` que declare soporte para `vitest` 5.x | Sin fecha; deja la tarea bloqueada por un tercero sin necesidad, cuando fijar una versión exacta que sí funciona es reversible y ya es el patrón del repo (`typescript`, `prisma`, `biome`) |
| Un test runner de Stryker distinto del oficial de Vitest (por ejemplo, invocar la CLI de Vitest a mano desde un `command` runner) | Reinventa lo que el plugin oficial ya resuelve (arnés de cobertura por test, activación de mutantes, recolección de resultados); más superficie propia para mantener a cambio de nada |

## Consecuencias

- `vitest` pasa de rango abierto (`^5.0.0`) a versión exacta (`4.1.11`) en todo el repo, por la
  misma razón por la que `typescript`, `prisma` y `biome` ya estaban exactos: una versión nueva de
  una herramienta de la que depende un mecanismo de verificación (acá, la activación de mutantes)
  puede romperlo en silencio. Subir `vitest` de mayor en el futuro exige repetir la comprobación
  de este ADR (una corrida de `test:mutacion` con una mutación conocida) antes de confiar el
  puntaje otra vez.
- F0-14, F0-15 y F0-16 corrieron en paralelo asumiendo `vitest` `^5.0.0` (heredado de F0-14) y
  fusionaron antes que esta tarea. Al rebasar `f0-17-mutacion` sobre `main` con F0-15 y F0-16 ya
  adentro, el único conflicto real fue `package-lock.json` (se resolvió regenerándolo con
  `npm install`, no a mano); `package.json`, `biome.json` y `AGENTS.md` mezclaron los dos lados sin
  intervención o con un conflicto de una sola sección (dos apartados nuevos en el mismo lugar de
  `AGENTS.md`: se conservaron los dos). Se repitieron los cuatro niveles de test y la corrida de
  mutación después del rebase (ver más arriba): todo sigue en verde con `vitest` en `4.1.11`.
- El mecanismo se hace cumplir con la propia corrida de `test:mutacion`: si alguien sube `vitest`
  de mayor sin revisar esto, el puntaje puede volver a desplomarse en silencio (nada en `ci` lo
  nota, porque `mutacion.yml` corre aparte y semanal) hasta la próxima corrida de los lunes.

## Cómo se revierte

Cuando exista una versión de `@stryker-mutator/vitest-runner` que declare soporte para `vitest`
5.x (o más): repetir la comprobación manual de este ADR (aplicar a mano una mutación conocida —
por ejemplo, la de `dia ?? ""` en `src/dominio/compartido/reloj.ts` — correr `npm run
test:dominio` y confirmar que falla; después correr `npm run test:mutacion` y confirmar que esa
misma mutación aparece como *"Killed"*, no *"Survived"*) antes de subir `vitest` de mayor otra vez
y de volver a confiar el puntaje que informe.
