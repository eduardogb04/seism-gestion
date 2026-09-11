# ADR 0003 — Las reglas `recommended` de Biome se fuerzan a `error`, una por una

> Archivo: `docs/adr/0003-biome-recommended-en-error.md`. Numeración correlativa, nunca se
> reutiliza. Un ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza
> y este se marca *Reemplazado por NNNN*.

**Fecha:** 2026-09-11
**Estado:** Aprobado
**Tarea:** F0-02
**Decide:** el plan (F0-02, criterio "Reglas en `error`, sin `warn`")

## Contexto

El criterio de F0-02 pide que las reglas de lint estén "en `error`, sin `warn`". Biome no cumple
eso por default: su preset `recommended` trae **severidad mixta por regla** — de 215 reglas
`recommended` (fuera de `nursery`), 84 vienen en `warn` o `info` (`noExplicitAny`,
`noUnusedVariables`, `useConst` y `noNonNullAssertion`, las cuatro que nombra el criterio de
F0-02, entre ellas). Una regla en `warn` no hace fallar `biome check` (exit code 0), así que el
fixture negativo (`tests/fixtures/lint/debe-fallar.ts`, que tiene que ser **rechazado**) pasaría
como aceptado si esas reglas se dejaran en su severidad por default.

No hay una opción de Biome que diga "todas las `recommended`, pero todas en `error`": `--only`
solo sube a `error` una regla puntual que estaba en `off`; el flag `--error-on-warnings` hace
fallar el proceso ante cualquier `warn`, pero no cambia la severidad reportada (seguiría
apareciendo como `warn` en la salida, y no serían realmente "reglas en error" como pide el
criterio).

## Decisión

`biome.json` usa `"preset": "recommended"` y, para cada uno de los cinco grupos que tienen
reglas `recommended` en `warn`/`info` (`complexity`, `correctness`, `performance`, `style`,
`suspicious` — `a11y` y `security` ya vienen enteras en `error`), lista esas reglas puntuales
con `"error"` explícito. La lista se generó corriendo `biome explain <regla>` (que imprime
`Default severity: ...` y si la regla `is recommended`) sobre las ~430 reglas no-`nursery` de la
versión instalada (`2.5.13`), y quedándose con las que son `recommended` y no ya `error`.

Para `tests/fixtures/lint/`, que el `biome.json` de la raíz excluye del lint normal (ver
`AGENTS.md`, sección *Formato y lint*), `--config-path` apuntando a esa carpeta **no alcanza**:
Biome igual encuentra el `biome.json` de la raíz al resolver desde el directorio de trabajo y
tira `Found a nested root configuration, but there's already a root configuration`. La solución
es un `biome.json` propio en `tests/fixtures/lint/` con `"root": true` (no hereda nada de la
raíz) y `scripts/lint-fixtures.ts` invoca el binario de Biome con `cwd` puesto en esa carpeta, no
con `--config-path` desde la raíz.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `--error-on-warnings` en `npm run lint` | Hace fallar el comando ante un `warn`, pero la regla se sigue reportando como `warn`: no cumple "reglas en error" tal cual lo pide el criterio, y no ayuda a decidir manualmente si algo debería ser `error` de verdad |
| Poner un grupo entero como `"suspicious": "error"` (en vez de listar reglas) | Ese atajo habilita **todas** las reglas del grupo (también las que no son `recommended`, incluida `nursery` si se mezclara), no solo las `recommended` que están en `warn`. Se sale del alcance que pide el criterio ("las recomendadas") |
| No tocar la severidad, aceptar `warn` en el lint normal | El fixture negativo dejaría de servir (Biome "aceptaría" el archivo con exit 0) y el criterio del plan queda incumplido literalmente |

## Consecuencias

- Se gana: `npm run lint` falla (exit distinto de 0) ante cualquier diagnóstico habilitado, sin
  depender de que alguien lea "warn" vs "error" en la salida; el fixture negativo
  (`lint:fixtures`) es fiable.
- Se pierde: `biome.json` lista ~84 reglas a mano. Si Dependabot sube la versión de Biome y esa
  versión cambia qué reglas son `recommended` o su severidad por default (agrega una nueva regla
  `recommended` en `warn`, por ejemplo), la lista queda desactualizada **en silencio** — Biome no
  avisa de reglas nuevas que no están mencionadas en `biome.json`. Hay que volver a correr el
  mismo procedimiento (`biome explain <regla>` sobre cada regla del grupo) después de cualquier
  bump de versión que no sea un patch de bugfix.
- Quién lo hace cumplir: `npm run lint` (CI desde F0-05) y su prueba negativa `npm run
  lint:fixtures`.

## Cómo se revierte

Borrar los objetos por grupo (`complexity`, `correctness`, `performance`, `style`, `suspicious`)
de `linter.rules` en `biome.json`, dejando solo `"preset": "recommended"`. El criterio de F0-02
("reglas en error, sin warn") pasaría a incumplirse para las reglas que Biome deja en `warn` por
default, y habría que resolverlo de otra forma (por ejemplo, revisando a mano qué reglas quedaron
en `warn` en cada corrida).
