# ADR 0002 — `npm run typecheck` rechaza el `any` explícito con un script propio

**Fecha:** 2026-09-11
**Estado:** Aprobado
**Tarea:** F0-01
**Decide:** Eduardo (delegó la decisión al agente orquestador)

## Contexto

El criterio de F0-01 pide que "un `any` explícito... frena `npm run typecheck`". TypeScript no
tiene ninguna opción de compilador para eso: `strict` y sus componentes (`noImplicitAny`, etc.)
solo frenan el `any` **implícito** (el que el compilador infiere cuando no puede inferir otra
cosa); escribir `any` a mano en una anotación de tipo es sintaxis válida en cualquier modo, y
`tsc` nunca la va a marcar como error por sí solo. Hace falta un mecanismo aparte, y el plan (P14 /
sección 7) exige no sumar dependencias fuera de lo ya aprobado.

## Decisión

`npm run typecheck` corre dos pasos: `tsc --noEmit` y, si pasa, `node scripts/sin-any.ts`.
`sin-any.ts` usa la API del compilador de `typescript` (ya es dependencia del proyecto; nada
nuevo) para:

1. Leer `tsconfig.json` con `ts.parseJsonConfigFileContent`, que ya resuelve su `include`/
   `exclude` (así `tests/fixtures/` queda afuera del typecheck normal, como pide el criterio).
2. Parsear cada archivo del proyecto y recorrer su AST con `ts.forEachChild`.
3. Fallar con `archivo:línea` ante cualquier nodo `ts.SyntaxKind.AnyKeyword`.

`scripts/lib/detectar-any.ts` tiene el recorrido del AST como función pura, reutilizada por
`sin-any.ts` (proyecto entero) y por `scripts/typecheck-fixtures.ts` (un fixture a la vez).

**Detalle de implementación, no de esta decisión pero documentado acá porque la determina:** al
armar esto, la versión `latest` publicada de `typescript` (7.0.2) resultó ser el nuevo compilador
nativo (reescrito, more rápido) y **no expone la API clásica del compilador** (`ts.createProgram`,
`ts.SyntaxKind`, `ts.forEachChild`, etc.) en su export por defecto — solo el número de versión y
una API distinta (`typescript/unstable/ast`) pensada para otro uso. La última versión estable que
todavía trae la API clásica es `6.0.3`, así que `package.json` fija `"typescript": "6.0.3"` (sin
rango) en vez de seguir `latest`. Si en algún momento la API clásica vuelve a estar disponible en
una versión más nueva (o el proyecto migra su tooling a la API nueva), se actualiza acá.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Esperar a Biome (F0-02), que sí tiene `noExplicitAny` como regla de lint | El criterio de F0-01 pide que `typecheck` lo frene ya, no `lint` más adelante. Biome igual lo suma en F0-02 como segunda red |
| Relajar el criterio a "se revisa a mano en el PR" | Deja de ser mecánico; el resto de las reglas no negociables del proyecto las hace cumplir una herramienta, no la memoria de quien revisa |
| Un lint rule custom de ESLint (`no-explicit-any` ya existe en `@typescript-eslint`) | Suma ESLint como dependencia nueva antes de tiempo: el plan ya eligió Biome para F0-02, y traer las dos herramientas es doble mantenimiento por una regla |
| Un `grep` sobre el código fuente buscando la palabra `any` | Falsos positivos con comentarios, strings y nombres de variable (`anyType`, `company`); el AST no tiene ese problema |

## Consecuencias

- Se gana: el criterio "nada de `any`" es mecánico desde F0-01, sin esperar a Biome ni sumar
  dependencias.
- Se pierde: un script propio (~60 líneas) que hay que mantener hasta que Biome lo vuelva
  redundante; y una versión de `typescript` fijada por debajo de `latest`, que Dependabot va a
  proponer subir — el PR que lo intente tiene que fallar en CI (ver `typecheck:fixtures`) o, si la
  API clásica reaparece, actualizarse a mano con este ADR editado.
- Quién lo hace cumplir: `npm run typecheck` (CI desde F0-05), y su prueba negativa
  `npm run typecheck:fixtures` con los fixtures de `tests/fixtures/typecheck/`.

## Cómo se revierte

Borrar el segundo paso de `typecheck` en `package.json` (queda solo `tsc --noEmit`) y borrar
`scripts/sin-any.ts`, `scripts/lib/detectar-any.ts`, `scripts/typecheck-fixtures.ts` y
`tests/fixtures/typecheck/`. El criterio de "nada de `any`" pasaría a depender solo de Biome
(F0-02) o de la revisión.
