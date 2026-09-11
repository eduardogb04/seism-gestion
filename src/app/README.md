# src/app

Next.js (App Router). Solo habla con `casos-uso`, `puertos` e
`infraestructura`. Los adaptadores le llegan a través del punto de armado
(`infraestructura/arranque`), nunca importándolos directo. Del `dominio` solo
lee tipos, con `import type`; para escribir pasa por un caso de uso.
dependency-cruiser lo hace cumplir (`npm run limites`, ver
`docs/arquitectura.md` y ADR 0004).

Vacío hasta F0-04.
