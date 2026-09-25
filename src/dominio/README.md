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

Lo que ya vive acá:

- `compartido/reloj.ts` (F0-18) — `Reloj { ahora(): FechaHora }`, el tipo
  `FechaHora` (fecha civil argentina, sin zona horaria) con sus operaciones, y
  `RelojFijo` para los tests.
- `compartido/identificador.ts` (F0-19) — el identificador doble de toda
  entidad (`Identificador<Marca>` con marca de tipo, y `CodigoLegible` tipo
  `SRV-2026-014`, con `formatearCodigo`/`parsearCodigo`). `formatearCodigo` es
  pura y toma el año como dato (lo necesita para reconstruir desde
  `parsearCodigo`); `generarCodigoLegible` arma un código nuevo y toma el año
  del `Reloj` inyectado.
- `compartido/historial.ts` (F0-21) — el historial de estados solo-agregar:
  `definirCiclo` ata una tabla de transiciones y la aritmética de fechas a
  `crear`, `agregar`, `estadoActual`, `fechaDe` y `diasEntre`. Genérico: no
  sabe qué entidad lo usa. Ver `docs/adr/0010-historial-de-estados.md`.

- `compartido/importe.ts` (F0-20) — `Importe<M>` en centavos `bigint` con la moneda
  como tipo literal (`MONEDAS`: sumar ARS con USD no compila), aritmética entera y `repartir`,
  `TipoDeCambio` con valor exacto (fracción de `bigint`, cargado desde texto) y `convertir`,
  único lugar que redondea (half-up), y `parsearImporte`. El formato para pantalla vive en
  `src/app/formato/importe.ts`. Ver `docs/adr/0018-importes.md`.

El resto del lote 5 (F0-22) llega después.
