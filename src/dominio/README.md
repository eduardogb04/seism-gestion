# src/dominio

Reglas de negocio puras. **Solo importa de sí mismo**: nada de Prisma, nada de
Next.js, nada de Zod, nada de `node:*`, nada de infraestructura. Lo hace
cumplir dependency-cruiser desde F0-03.

Cero llamadas a la fecha del sistema (`Date`): el reloj se inyecta
(`compartido/reloj.ts`, desde F0-18). TDD estricto: cada regla nace como test
en `tests/dominio/`.

Vacío hasta el lote 5 (F0-18 en adelante).
