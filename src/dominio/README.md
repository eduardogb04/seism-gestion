# src/dominio

Reglas de negocio puras. **Solo importa de sí mismo**: nada de Prisma, nada de
Next.js, nada de Zod, nada de `node:*`, nada de infraestructura. Lo hace
cumplir dependency-cruiser (`npm run limites`, regla `dominio-puro`; ver
`docs/arquitectura.md`).

Cero llamadas a la fecha del sistema (`Date`): el reloj se inyecta
(`compartido/reloj.ts`, desde F0-18). TDD estricto: cada regla nace como test
en `tests/dominio/`.

Lo que ya vive acá:

- `compartido/historial.ts` (F0-21) — el historial de estados solo-agregar:
  `definirCiclo` ata una tabla de transiciones y la aritmética de fechas a
  `crear`, `agregar`, `estadoActual`, `fechaDe` y `diasEntre`. Genérico: no
  sabe qué entidad lo usa. Ver `docs/adr/0010-historial-de-estados.md`.

El resto del lote 5 (F0-18, F0-19, F0-20, F0-22) va llegando a `compartido/`.
