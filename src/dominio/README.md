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
  sabe qué entidad lo usa. Ver `docs/adr/0010-historial-de-estados.md`. También
  vive acá `Resultado<T, E>`, el tipo compartido de éxito/fallo que reusan
  `actor.ts` y `auditable.ts`.
- `compartido/actor.ts` (F0-22) — `Actor`: `{ tipo: 'persona', usuarioId }`
  o `{ tipo: 'sistema', proceso: NombreProceso }`. No existe actor anónimo
  (probado con `@ts-expect-error`). `NombreProceso` es texto marcado,
  kebab-case, construido con `crearNombreProceso`.
- `compartido/origen.ts` (F0-22) — `Origen`: manual, ingesta de mail o
  propuesta de IA (con `confirmadoPor?: Actor`). `estaConfirmado(origen)` es
  `true` para manual y para IA confirmada, `false` para ingesta de mail y
  para IA sin confirmar.
- `compartido/auditable.ts` (F0-22) — `Auditable<T>` (creado/actualizado/
  eliminado, quién y cuándo) con `crearAuditable`, `marcarActualizado` y
  `marcarEliminado`: la única forma de "borrar" es marcar `eliminadoEn`, sin
  quitar nada (borrado lógico). También `RegistroAuditoria` y su
  constructor `crearRegistroAuditoria`, la entrada del historial de
  auditoría que persiste F0-30 a través del puerto `Auditoria`
  (`src/puertos/auditoria.ts`).

- `compartido/importe.ts` (F0-20) — `Importe<M>` en centavos `bigint` con la moneda
  como tipo literal (`MONEDAS`: sumar ARS con USD no compila), aritmética entera y `repartir`,
  `TipoDeCambio` con valor exacto (fracción de `bigint`, cargado desde texto) y `convertir`,
  único lugar que redondea (half-up), y `parsearImporte`. El formato para pantalla vive en
  `src/app/formato/importe.ts`. Ver `docs/adr/0018-importes.md`.
