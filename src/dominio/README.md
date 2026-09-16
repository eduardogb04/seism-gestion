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
`RelojFijo` para los tests. El resto del lote 5 llega en F0-19 y siguientes.
