# src/app

Next.js (App Router). Solo habla con `casos-uso`, `puertos` e
`infraestructura`. Los adaptadores le llegan a través del punto de armado
(`infraestructura/arranque`), nunca importándolos directo. Del `dominio` solo
lee tipos, con `import type`; para escribir pasa por un caso de uso.
dependency-cruiser lo hace cumplir (`npm run limites`, ver
`docs/arquitectura.md` y ADR 0004).

Desde F0-04: `layout.tsx` (el layout raíz mínimo que exige el App Router),
`page.tsx` (la página de inicio) y `api/salud/route.ts` (el latido público,
`{ ok: true, version }`). `src/instrumentation.ts`, en la raíz de `src/`, es
parte de esta entrada: valida el entorno al arrancar (ADR 0005).
