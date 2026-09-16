# src/dominio

Reglas de negocio puras. **Solo importa de sí mismo**: nada de Prisma, nada de
Next.js, nada de Zod, nada de `node:*`, nada de infraestructura. Lo hace
cumplir dependency-cruiser (`npm run limites`, regla `dominio-puro`; ver
`docs/arquitectura.md`).

Cero llamadas a la fecha del sistema (`Date`): el reloj se inyecta
(`compartido/reloj.ts`, desde F0-18). TDD estricto: cada regla nace como test
en `tests/dominio/`.

Desde F0-19: `compartido/identificador.ts`, el identificador doble de toda
entidad (`Identificador<Marca>` con marca de tipo, y `CodigoLegible` tipo
`SRV-2026-014`, con `formatearCodigo`/`parsearCodigo`). No importa el reloj
de F0-18: el año le llega ya resuelto, como parámetro numérico — el dominio
no necesita saber de dónde salió.
