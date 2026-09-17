# src/dominio

Reglas de negocio puras. **Solo importa de sí mismo**: nada de Prisma, nada de
Next.js, nada de Zod, nada de `node:*`, nada de infraestructura. Lo hace
cumplir dependency-cruiser (`npm run limites`, regla `dominio-puro`; ver
`docs/arquitectura.md`).

Cero llamadas a la fecha del sistema (`Date`): el reloj se inyecta
(`compartido/reloj.ts`, desde F0-18) y lo hace cumplir Biome, con un
`override` sobre `**/src/dominio/**` que marca error ante la global `Date`
(`npm run lint`, probado por `npm run lint:fixtures`; ver ADR 0012). TDD
estricto: cada regla nace como test en `tests/dominio/`.

Hoy: `compartido/reloj.ts` — `Reloj { ahora(): FechaHora }`, el tipo
`FechaHora` (fecha civil argentina, sin zona horaria) con sus operaciones, y
`RelojFijo` para los tests.

Desde F0-19: `compartido/identificador.ts`, el identificador doble de toda
entidad (`Identificador<Marca>` con marca de tipo, y `CodigoLegible` tipo
`SRV-2026-014`, con `formatearCodigo`/`parsearCodigo`). `formatearCodigo` es
pura y sigue tomando el año como dato (lo necesita para reconstruir desde
`parsearCodigo`, sin reloj de por medio); `generarCodigoLegible` es la que
arma un código nuevo para "ahora" y sí recibe el `Reloj` inyectado
(`compartido/reloj.ts`, F0-18), tomando el año de `reloj.ahora()`.
