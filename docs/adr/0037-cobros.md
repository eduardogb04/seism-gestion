# ADR 0037 — Cobros de facturas: la retención cuenta para el saldo y *cobrada* se calcula

**Fecha:** 2026-10-15
**Estado:** Aprobado
**Tarea:** F2-07
**Decide:** el plan (F2-07) y el orquestador (R1 a R16 de la ficha); ADR 0034 (la regla de saldo y el tipo de cambio) y ADR 0036 (facturas)

## Contexto

Una factura se cobra en uno o varios cobros del cliente, a veces con retenciones, y si es en dólares, a un tipo de cambio que
se conoce recién ese día. Es la misma forma que un egreso con sus pagos (ADR 0034), con una diferencia: la retención, que
cancela deuda pero no entra a ninguna cuenta.

## Decisión

**Un cobro cancela deuda con su importe más su retención, los dos en la moneda de la factura; solo el importe entra a la
cuenta.** El saldo es `total con IVA − Σ (importe + retención)` de los cobros vigentes, y se calcula con `saldoDe` y `pagar` de
`saldo.ts`: no hay otra regla de saldo. El total es `totalConIva` de la factura (ADR 0036).

- **Dominio** (`src/dominio/servicios/cobro.ts`): `saldoDeFactura` arma, sobre `saldoDe`, cobrado, retenido y saldo
  (`cobrado + retenido + saldo = total`, el saldo nunca es negativo); `estaCobrada` es saldo cero. Una retención sola puede saldar:
  el importe de un cobro puede ser cero si la retención no lo es. `src/dominio/servicios/avance.ts` suma, por moneda y sin
  convertir, el total de las órdenes (sin IVA), lo facturado (con IVA), lo cobrado y lo pendiente (facturado − cobrado): las dos
  bases son distintas y la pantalla lo dice (*sin IVA* / *con IVA*).
- **Cobrada se deriva, no se guarda.** Tampoco el saldo ni el avance: salen de los cobros vigentes (los anulados no cuentan). No hay
  columna que se pueda desincronizar.
- **Tipo de cambio.** `importeEnCuenta` (ADR 0034) da lo que entró a la cuenta (`entrada`, con la columna espejo de `salida` de
  los pagos). Es obligatorio si la cuenta es de otra moneda que la factura y no va si es la misma (`DOM-0013`). Cobrar de más
  (importe + retención > saldo) es `DOM-0012`, con el mismo estilo de mensaje que los pagos.
- **Lo que comparten con los pagos** vive en `src/casos-uso/compartido/movimientos.ts` (mensajes, paso a la cuenta, días de
  atraso, campos del formulario, cuentas activas); `egresos/pagos.ts` lo usa sin cambiar su comportamiento.
- **Dos cobros a la vez no pasan del total:** `registrar` toma la fila del **servicio** (`RepositorioServicios.bloquear`, el mismo
  bloqueo que ordenes y facturas desde ADR 0036) y recién entonces relee el saldo. Anular una factura toma el mismo bloqueo, así que
  un cobro y la anulación de su factura se turnan.
- **Anular, no editar.** Un cobro mal cargado se anula (baja lógica) y el saldo vuelve. Una factura con cobros vigentes no se
  anula (`DOM-0016`), como una orden con facturas (`DOM-0014`).
- **No existen cobros sin factura:** la clave foránea es obligatoria. Se cobran desde la pantalla del servicio, en su sección de
  facturas; *Por cobrar* (`/servicios/por-cobrar`) lista las facturas con saldo por vencimiento, con los días de atraso.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Guardar la retención como un cobro aparte | Se carga junto al cobro que la originó; separarla duplicaría fecha, cuenta y observaciones, y una retención no entra a ninguna cuenta. |
| Que la retención no cuente para el saldo | La factura quedaría con saldo por una deuda que el cliente ya canceló al retener. |
| Guardar el estado *cobrada* | Se podría desincronizar de los cobros; saldo cero ya lo dice. |
| Convertir a una moneda para sumar el avance | El tipo de cambio es de cada cobro; un avance convertido inventaría uno. Va por moneda. |
| Calcular el saldo de *Por cobrar* en la base | Sería una segunda implementación de `totalConIva` y del saldo. Se traen las facturas vigentes con sus cobros y calcula el dominio. |

## Consecuencias

- Se gana una sola regla de saldo para pagos y cobros, y un avance que no mezcla monedas ni bases de IVA.
- *Por cobrar* trae todas las facturas vigentes y filtra en el caso de uso, sin paginar: alcanza para el volumen de la empresa; si
  creciera, se pagina ahí (no cambia el dominio).
- Mientras haya cobros vigentes, la cuenta no se da de baja: un disparador (migración `20261015130000_cuentas_con_cobros`) lo rechaza como los de los pagos, la baja vuelve como `DOM-0010`, y registrar un cobro toma la fila de la cuenta (`FOR SHARE`) para que una baja en curso espere.
- Lo hace cumplir `tests/dominio/cobro.test.ts` y `avance.test.ts` (propiedades, 1000 corridas), `tests/casos-uso/cobros.test.ts`
  (incluida la concurrencia) y `tests/e2e/cobros.spec.ts`.

## Cómo se revierte

La migración `20261015120000_cobros` tiene su `down.sql`. Fuera de la tabla, la decisión vive en `cobro.ts`, `avance.ts`,
`casos-uso/servicios/cobros.ts` y las pantallas de `src/app/servicios/`; los pagos solo dependen de `movimientos.ts`, que
se puede dejar donde está.
