# ADR 0050 — Notas de crédito y débito y la factura adicional

**Fecha:** 2026-10-29
**Estado:** Propuesto
**Tarea:** F6-03
**Decide:** el orquestador (R1, R2 y R10 de la ficha de F6-03; a confirmar por Eduardo)

## Contexto

En «Finalizado» hacen falta ajustes de lo facturado (DISENO, relevamiento del 2026-10-29): una nota de
crédito que baja una factura, una de débito que suma, y una factura por un servicio adicional que no
estaba en la orden de compra. Las facturas viven en `facturas` (ADR 0036), con cobros (ADR 0037),
devengado (ADR 0041) y el inicio en una moneda (ADR 0042): todo lo que suma lo facturado, lo que falta
cobrar y el cierre las lee de ahí.

## Decisión

**Los tres son filas de `facturas`, con el importe siempre positivo, y el signo lo pone el dominio.**

- Columnas nuevas: `tipo` (`factura`, `nota_debito`, `nota_credito`; por defecto `factura`),
  `adicional` (solo con `tipo = 'factura'`), `comprobante_asociado_id` (clave foránea a `facturas`,
  obligatoria en la nota de crédito) y `motivo_anulacion`. Tres `CHECK` lo hacen cumplir en la base, y
  el número es único por tipo entre los vigentes (una nota de crédito tiene su numeración).
- `src/dominio/servicios/comprobante.ts` es el único lugar que sabe el signo (`importeConSigno`,
  `TIPOS_QUE_RESTAN`) y el saldo de cada comprobante: su total con IVA, menos las notas de crédito
  vigentes asociadas, menos los cobros (`saldosDeComprobantes`, con `saldoDeFactura` y la regla de
  `saldo.ts`). La nota de crédito no tiene saldo propio y nunca pasa el saldo pendiente de su asociado
  (`DOM-0043`); el asociado es una factura, una adicional o una nota de débito vigente del servicio y en
  su moneda (`DOM-0042`). Un comprobante con notas de crédito vigentes no se anula (`DOM-0044`).
- Consume la orden de compra (saldo de la orden, por facturar y devengado por hitos) la factura no
  adicional y las notas cuya cadena de asociados termina en ella (`cuentaParaLaOrden`); la nota hereda
  la orden de su asociado. La adicional y lo que cuelga de ella, no.
- El cierre automático (`todoCobrado`) mira los comprobantes con saldo, con las notas ya restadas. Cargar
  o anular un ajuste, y anular una factura, llaman a `cerrarSiEstaCobrado` en la misma transacción.
- Se cargan y se anulan solo en «Finalizado» (carga `ajuste` de `estados.ts`), con motivo, por
  `src/casos-uso/servicios/ajustes.ts`; anular una nota o una adicional desde la factura es `DOM-0045`.
  La nota de crédito no se cobra (`DOM-0046`).
- El inicio suma en la base con signo: las consultas restan los tipos de `TIPOS_QUE_RESTAN`, que les
  llegan por parámetro, cada documento convertido con su tipo de cambio (ADR 0042).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Una tabla por comprobante (`notas_credito`, `notas_debito`) | Cada suma del inicio, la cobranza, *Por cobrar* y el cierre tendría que leer tres tablas, y los cobros apuntan a `facturas`: una nota de débito no se podría cobrar sin otra clave foránea polimórfica. |
| Guardar el importe de la nota de crédito en negativo | El `CHECK` de importes positivos, la regla de saldo y cada formulario asumen positivos; el signo quedaría repetido en cada lugar que suma, en vez de en una función. |
| La nota de crédito como un «cobro» de la factura | Mezcla plata que entró con un comprobante fiscal; el cobrado del inicio y de la cuenta quedaría mal. |

## Consecuencias

- Todo lo que lee `facturas` ve los ajustes sin cambiar de tabla; lo que suma usa el signo del dominio.
- La reversión no es libre: el `down.sql` **se niega si hay notas o facturas adicionales**, anuladas o
  no, porque sin el tipo pasarían por facturas comunes y cambiarían lo facturado. Para bajar la
  migración hay que sacarlas antes a mano, con un respaldo.
- Lo hacen cumplir `tests/dominio/comprobantes.test.ts` (propiedad contra un modelo aparte),
  `tests/casos-uso/ajustes.test.ts`, `tests/casos-uso/etapas.test.ts` y
  `tests/casos-uso/migracion-notas-y-adicional.test.ts`.
- Fuera de esto: notas de crédito sobre lo ya cobrado (saldo a favor del cliente) y comprobantes
  electrónicos.

## Cómo se revierte

Sacar los ajustes de la base, bajar `20261029120000_notas_y_adicional` y borrar `comprobante.ts`,
`ajustes.ts` y la pieza `src/app/servicios/_piezas/ajustes.tsx`; las sumas vuelven a ser las de antes
porque, sin tipos que resten, `importeConSigno` es la identidad.
