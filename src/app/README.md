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

Desde F0-26: `salud/` (`/salud`, el panel de salud: cada job con su última corrida y
su color, fallidos pendientes, integraciones y gasto de IA). Server Component, sin
`"use client"`, sin `<script>` ni librerías de UI; se recarga con F5. Empieza con
`await accesoDeAdministrador()` como las páginas de administración; `/api/salud`
sigue pública. El color lo trae ya decidido `listarSalud`: la página solo lo muestra.
