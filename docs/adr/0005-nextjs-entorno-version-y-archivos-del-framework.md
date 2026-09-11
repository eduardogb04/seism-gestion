# ADR 0005 — Next.js: entorno validado al arrancar, versión fijada en el build y archivos del framework

> Archivo: `docs/adr/0005-nextjs-entorno-version-y-archivos-del-framework.md`. Numeración
> correlativa, nunca se reutiliza. Un ADR aprobado no se edita: si cambia la decisión, se escribe
> otro que lo reemplaza y este se marca *Reemplazado por NNNN*.

**Fecha:** 2026-09-11
**Estado:** Propuesto
**Tarea:** F0-04
**Decide:** el orquestador de Fase 0 (validación al arrancar y origen de la versión), sobre el
criterio de F0-04; el resto, el dev de F0-04

## Contexto

F0-04 trae Next.js 16 (App Router) con una página, `GET /api/salud` y la validación del entorno
con Zod. Pide que con `APP_ENTORNO` ausente o inválida **la app no arranque**, que la versión del
latido sea el SHA corto de git **inyectado en build**, que `npm run build` pase con
`output: 'standalone'`, y que el `tsconfig` siga severo. Next trae además archivos que carga por
su nombre (páginas, rutas, `instrumentation.ts`), exige cambios en `tsconfig.json` y, bajo un
agente de IA, escribe en `AGENTS.md`. Hubo que decidir dónde corre cada cosa.

## Decisión

**El entorno se valida al arrancar el servidor, en `register()` de `src/instrumentation.ts`; la
versión se resuelve al compilar, en `next.config.ts`, y queda fija en el código compilado.**

1. **Entorno.** `src/infraestructura/entorno.ts` tiene el esquema Zod, `validarEntorno` (pura, con
   su test de nivel dominio) y `exigirEntornoValido`, que valida `process.env` y, si falla,
   escribe en stderr qué variable falta o es inválida y hace `process.exit(1)`. Next llama a
   `register()` una vez al levantar el servidor, antes de atender pedidos, en `next dev` y en
   `.next/standalone/server.js`; no la llama en `next build`, así que compilar no necesita
   `.env`. Como Next compila `instrumentation.ts` también para el runtime Edge (sin
   `process.exit`), la validación se importa **adentro** de `if (process.env.NEXT_RUNTIME ===
   "nodejs")`, el patrón que documenta Next; así el compilado de Edge no la incluye y el build no
   emite advertencias.
2. **Versión.** `next.config.ts` exporta una función de la fase. En `next build` y `next dev`
   resuelve la versión con `resolverVersion` (`src/infraestructura/version.ts`, pura, testeada):
   `APP_VERSION` si viene definida (la va a pasar el build de Docker de F0-07, que no tiene
   `.git`), si no `git rev-parse --short HEAD`, y si no hay ninguna **el build falla** con un
   mensaje que lo dice. La inyecta con la opción `env`, así que Next reemplaza
   `process.env.APP_VERSION` por el literal en el código compilado: el servidor ya no depende de
   git ni de lo que tenga el entorno al ejecutar. Si la ruta corriera sin ese reemplazo (código no
   compilado por Next con esta configuración), `/api/salud` responde 500 `{ ok: false }` en vez
   de un `ok: true` sin versión.
3. **Límites.** `src/instrumentation.ts` tiene que vivir en la raíz de `src/` (Next no lo busca
   en `src/app/`), pero es parte de la entrada `app`: las reglas `adaptadores-solo-en-arranque` y
   `app-worker-dominio-solo-tipos` le aplican igual, con fixture. `no-orphans` exceptúa los
   archivos que Next carga por su nombre sin que nadie los importe: `page`, `layout` y `route`
   (`.ts`/`.tsx`) en cualquier carpeta de `src/app/`, y `src/instrumentation.ts`; un `.tsx`
   suelto con otro nombre sigue siendo huérfano (fixture). Otros archivos especiales de Next
   (`loading`, `error`, `not-found`...) se suman a la excepción en la tarea que los use. Sin alias
   `@/*`: imports relativos con extensión `.ts`, como el resto del repo (por eso no hace falta
   `options.tsConfig`).
4. **`tsconfig.json`.** Siguen activos `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`,
   `noUnusedParameters`, `noImplicitReturns` y `exactOptionalPropertyTypes`, sin excepciones:
   ninguna tipificación de Next chocó con ellos. Se aceptó lo que Next exige o sugiere:
   `jsx: "react-jsx"` (obligatorio), `plugins: [{ name: "next" }]` (para el editor; si falta,
   `next build` lo vuelve a agregar), `incremental: true` (con `*.tsbuildinfo` en `.gitignore`) y
   en `include` los tipos que genera (`next-env.d.ts`, `.next/types/**/*.ts`,
   `.next/dev/types/**/*.ts`). Además: `allowJs: false` explícito (Next sugiere `true`; el repo es
   solo TypeScript y `sin-any.ts` no mira JavaScript), `src/**/*.tsx` y `next.config.ts` en
   `include`, y `.next` **fuera** de `exclude`, para que `tsc` corra el validador que Next genera
   (`.next/types/validator.ts`: que las páginas, layouts y rutas exporten lo que Next espera) con
   nuestras opciones severas.
5. **`sin-any.ts` saltea lo generado por Next** (`.next/`, `next-env.d.ts`): el validador trae
   `any` propios y no es código nuestro. `tsc` sí lo revisa.
6. **`agentRules: false`.** Bajo un agente de IA, `next dev` escribe un bloque propio en inglés
   dentro de `AGENTS.md` (y crea `CLAUDE.md` si falta). `AGENTS.md` lo escribimos nosotros; lo
   útil del bloque (leer la documentación de la versión instalada en `node_modules/next/dist/docs/`
   antes de escribir código de Next) queda dicho en `AGENTS.md`, en castellano.
7. **`next/constants.js` con extensión** en `next.config.ts`: con `module: NodeNext` y
   `"type": "module"`, un import sin extensión de un paquete sin mapa `exports` no resuelve.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Validar el entorno en `next.config.ts` | Corre también en `next build` (compilar pediría `.env`) y `.next/standalone/server.js` no carga `next.config.ts`: el servidor de producción no validaría nada |
| Validar al importar un módulo desde una ruta o el layout | Corre recién con el primer pedido que lo toca: el servidor "arranca" y falla después, que es justo lo que el criterio prohíbe |
| Servidor propio (`server.ts`) que valida y después levanta Next | Más código propio para lo que `instrumentation.ts` ya hace, y se pierde el `server.js` de `standalone` que va a usar la imagen |
| Lanzar una excepción en `register()` en vez de `process.exit(1)` | Qué hace Next con una excepción en `register()` no está documentado como "termina el proceso"; `exit(1)` es explícito y se verificó en las dos formas de arrancar |
| Versión leída del entorno al ejecutar | El criterio pide que venga del build; una variable de ejecución se olvida o se desincroniza y la imagen mentiría su versión |
| `NEXT_PUBLIC_APP_VERSION` | Además de inyectarla, la mandaría al JavaScript del navegador; no hace falta |
| Dejar `.next` en `exclude` | Anula en silencio los `include` que agrega Next: el validador de rutas y páginas nunca correría, aunque el `tsconfig` parezca incluirlo |
| Relajar opciones del `tsconfig` para Next | Prohibido por el plan; además no hizo falta |
| Dejar `agentRules` en su valor por defecto | Cada `next dev` bajo un agente reescribe `AGENTS.md` con un bloque ajeno, y el diff aparece en cualquier tarea |

## Consecuencias

- Se gana: la app no levanta con el entorno mal, en local y en el servidor, con un mensaje que
  nombra la variable (sin repetir su valor: mañana puede ser un secreto). Compilar no necesita
  `.env`. La versión del latido es la del build, y un build sin versión no existe.
- Se pierde o queda más difícil: Next imprime `Ready` antes de correr `register()`, así que la
  salida de un arranque fallido muestra `Ready` y enseguida el error y el código 1. Cada archivo
  especial nuevo de Next pide su excepción en `no-orphans`. `npm run typecheck` en un clon limpio
  (sin `.next/`) no ve el validador de Next; lo corre el `tsc` de `next build`, y el `typecheck`
  local después de un `dev` o un `build`. Cada `next build` y `next dev` corre `git` una vez.
- A tener en cuenta en F0-07: si al compilar existe un `.env`, `next build` lo copia a
  `.next/standalone/.env` y `server.js` lo lee. La imagen no puede compilarse con un `.env` en el
  contexto (`.dockerignore`), o se lleva los valores adentro; en el servidor, las variables van
  en el entorno del contenedor.
- Quién lo hace cumplir: `tests/dominio/entorno.test.ts` y `tests/dominio/version.test.ts`;
  `npm run limites` y `npm run limites:fixtures` (con los fixtures nuevos de `instrumentation.ts`,
  `page.tsx` y `suelto.tsx`); `npm run typecheck` y `npm run build`. Que el proceso termine con
  código 1 se verificó a mano en el PR de F0-04 (el e2e de humo llega en F0-14).

## Cómo se revierte

- Mover la validación: cambiar `src/instrumentation.ts` (y nada más: el esquema y
  `validarEntorno` no dependen de dónde se llamen).
- Cambiar el origen de la versión: `next.config.ts` y `resolverVersion`; `/api/salud` solo lee
  `process.env.APP_VERSION`.
- Sacar `src/instrumentation.ts` de las reglas de `app`: la constante `INSTRUMENTACION_NEXT` en
  `.dependency-cruiser.cjs` y sus fixtures.
- Volver a dejar que Next escriba en `AGENTS.md`: borrar `agentRules: false`.
