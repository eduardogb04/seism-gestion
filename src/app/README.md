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

Desde F0-32: `administracion/` (inicio y `usuarios/`: lista, alta, revocar y
cambiar rol con Server Actions y formularios HTML, sin JavaScript de cliente).
Toda página de ahí llama a `accesoDeAdministrador()` antes de leer datos; un
operador ve `AUT-0003`. Ver ADR 0028.
