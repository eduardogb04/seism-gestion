# ADR 0042 — El inicio en una sola moneda: cada documento con su tipo de cambio

**Fecha:** 2026-10-19
**Estado:** Aprobado
**Tarea:** F3-08
**Decide:** el plan (F3-08) y el orquestador (R3 y R4 de la ficha). Quién fija el tipo de cambio de cada número y el de los documentos en pesos se confirman con Eduardo en el corte.

## Contexto

El inicio de F2-10 muestra cada moneda por separado. F3-08 pide un selector pesos/dólares que convierta todo, y F3-04 dejó un
tipo de cambio en cada orden de compra, factura y egreso en dólares (pesos por dólar). No hay cotización externa: lo único que existe es lo que se cargó en los documentos.

## Decisión

Se convierte **documento por documento y recién después se suma**: `convertirDeDocumento` y `sumarConvertidos`
(`src/dominio/tablero/conversion.ts`) usan `convertir` (half-up al centavo) con el tipo de cambio de cada documento. Sumar primero y convertir con un promedio da otro número.

- **Qué tipo de cambio usa cada número.** Facturado y rentabilidad: el de cada factura. Egresos: el de cada egreso. **Cobrado y pagado: el del documento que cancelan** (la factura o el egreso), no el del cobro o el pago, para que por cobrar = facturado − cobrado también convertido. Pendientes: el de cada factura o egreso.
- **Documentos en dólares:** su propio tipo de cambio. Si no lo tienen (anteriores a F3-04), no se convierten.
- **Documentos en pesos, al mirar en dólares:** el tipo de cambio **más reciente cargado en cualquier documento en dólares** (orden de compra, factura, egreso, cobro o pago) con fecha igual o anterior a la suya; ante igual fecha, el cargado último. Si no hay, no se convierten. La base lo resuelve en un CTE (`cambio_de_documento`, `src/adaptadores/prisma/tablero.ts`). Un tipo de cambio de cero o negativo no cuenta.
- **Sin tipo de cambio:** el documento queda **fuera** de las sumas y se cuenta aparte, nunca como cero en silencio. El aviso del inicio («3 documentos sin tipo de cambio») es el largo de la lista de `/sin-tipo-de-cambio`: las facturas y egresos vigentes, de toda la historia, que no se pueden mirar en la moneda elegida. Es el mismo caso de uso (`documentosSinCambio`) el que cuenta y el que lista.
- **Selector:** `?moneda=ARS|USD` (pesos por defecto; un valor inválido vuelve a pesos), validado con Zod, junto a `?mes=AAAA-MM`. Son enlaces, sin JavaScript de cliente.
- **Los doce meses** salen de una consulta agrupada por mes, importe y tipo de cambio por tabla (`facturadoPorMes`, `egresosPorMes`), no de doce llamadas.
- **La rentabilidad por servicio sigue siendo «de siempre»** (definición de F2-10): los diez servicios de mayor facturación convertida y el resto sumado en «Otros».
- Las tarjetas de cada moneda, los totales sin convertir y los listados a los que llevan no cambian.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un solo tipo de cambio por moneda o por mes | Cada documento tiene el suyo cargado a mano: promediar inventa un número que ningún documento dice |
| Contar sin tipo de cambio como cero | Subestima en silencio; el aviso con su lista lo hace visible |
| Cobrado y pagado con el tipo de cambio del cobro o del pago | Ese es el de la cuenta, no el de la deuda: por cobrar dejaría de cuadrar con facturado menos cobrado |
| Cotización de un servicio externo | Dependencia nueva; el sistema solo usa lo que se cargó a mano |

## Consecuencias

- Se gana un inicio en una sola moneda sin inventar cotizaciones.
- Un documento en pesos viejo, anterior a todo tipo de cambio cargado, no entra al verlo en dólares y se avisa.
- Convertir y sumar documento por documento puede diferir en centavos de convertir un total: es lo que pide la regla.
- Lo hace cumplir `tests/dominio/conversion-de-documento.test.ts` y `tests/casos-uso/tablero-convertido.test.ts` (totales calculados a mano con tipos de cambio distintos por documento).

## Cómo se revierte

Se quita `convertido.ts` y su uso en `tablero.ts` y el selector del inicio; las consultas con tipo de cambio quedan sin uso y se borran. Las tarjetas de cada moneda no dependen de nada de esto.
