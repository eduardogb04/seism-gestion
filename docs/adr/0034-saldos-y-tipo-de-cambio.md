# ADR 0034 — Saldos y tipo de cambio de los pagos

**Fecha:** 2026-10-02
**Estado:** Aprobado
**Tarea:** F2-09
**Decide:** el plan (F2-09) y el orquestador (R1 a R10 de la ficha); DISENO (decisión 1); ADR 0018 (importes) y ADR 0032 (egresos)

## Contexto

Un egreso se paga en uno o varios pagos, desde una cuenta. La cuenta puede ser de otra moneda que el egreso (un egreso en
dólares pagado desde una cuenta en pesos), y el tipo de cambio se carga a mano ese día. Los cobros (F2-07) tienen la misma
forma —un total y pagos parciales—, así que la regla no puede vivir adentro de los egresos.

## Decisión

**La deuda manda: el pago se carga en la moneda de la deuda.** El importe de un pago es lo que cancela del total, en la
moneda del total, y el saldo es `total − Σ pagos`, siempre en esa moneda y exacto. Si la cuenta es de otra moneda, el pago
guarda además **lo que salió de la cuenta**, en la moneda de la cuenta, y el tipo de cambio cargado (valor y fuente). El
redondeo queda del lado de la cuenta, nunca de la deuda.

- **La regla de saldo** es `src/dominio/compartido/saldo.ts`: pura, genérica (un `Importe` total y sus pagos). `pagar` rechaza un
  pago que deje el saldo negativo (`supera-saldo`), uno de cero o negativo y uno en otra moneda, todos con `DOM-0012`. No sabe
  de egresos ni de facturas. Usa `sumar` y `restar` de `importe.ts`; no hay otra aritmética.
- **Lo que salió de la cuenta** lo calcula `importeEnCuenta` con `crearTipoDeCambio` y `convertir`: es el **único lugar que
  redondea** (a medio-arriba al centavo). El tipo de cambio es obligatorio si las monedas difieren y no va si coinciden
  (`DOM-0013`).
- **El saldo se calcula, no se guarda.** Pagado y saldo salen de los pagos vigentes (los anulados no cuentan), en el caso de uso
  y, para *Por pagar*, en la consulta de la base. No hay columna de saldo que se pueda desincronizar.
- **Dos pagos a la vez no se pasan del total:** el alta corre en una transacción, toma la fila del egreso (`FOR UPDATE`) y la de
  la cuenta (`FOR SHARE`) y recién entonces relee el saldo; el segundo espera y ve el primero.
- **Pagar no es un ABM:** su validación depende del saldo. Tiene su caso de uso, su puerto y su adaptador, con el `Actor` y la
  auditoría en la misma transacción como el resto; reusa el repositorio con conversión del molde (`crearRepositorioConConversion`).
- **Anular, no editar.** Un pago mal cargado se anula (borrado lógico) y el saldo vuelve.
- **Mientras haya pagos vigentes, la base lo impide:** disparadores en la migración rechazan dar de baja la cuenta o el egreso de
  un pago vigente, cambiar la moneda del egreso y bajar su importe de lo ya pagado. El molde de ABM no conoce los pagos y no se tocó;
  la baja vuelve como `DOM-0010`.

**Cómo lo reutilizan los cobros.** F2-07 llama a `saldoDe`/`pagar` con el total de la factura y los cobros, y a `importeEnCuenta`
con la cuenta de destino. Lo propio de los cobros (su caso de uso y su tabla) se arma al lado, igual que acá.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Guardar el saldo del egreso en una columna | Se desincroniza con cada alta, anulación o edición; calcularlo cuesta una suma |
| Cargar el pago en la moneda de la cuenta y convertir para descontar de la deuda | El redondeo caería sobre la deuda y el saldo dejaría de ser exacto; saldar en dólares podría dejar centavos |
| Un tipo de cambio opcional cuando las monedas difieren | Un pago sin tipo de cambio no se puede explicar después: lo que salió de la cuenta quedaría sin base |
| Comprobar el saldo fuera de la transacción | Dos pagos simultáneos pasarían del total |
| Pagos como un ABM más del molde | Su validación depende del saldo en la base, que el molde no conoce |

## Consecuencias

- El saldo de un egreso es exacto en su moneda; la plata que salió de cada cuenta queda registrada con el tipo de cambio de ese día.
- *Por pagar* suma saldos **por moneda**, sin mezclar pesos con dólares.
- Editar un egreso con pagos por debajo de lo pagado o cambiándole la moneda lo rechaza la base (restricción), no el molde: la
  pantalla de edición todavía no lo traduce a un mensaje.
- Lo hacen cumplir `tests/dominio/saldo.test.ts` (propiedades), `tests/casos-uso/pagos.test.ts` (base real, incluida la
  concurrencia y los disparadores) y `tests/e2e/pagos.spec.ts`.

## Cómo se revierte

Migración `20261002170000_pagos` (`down.sql`): quita la tabla `pagos` y los disparadores. `saldo.ts` y el caso de uso se borran sin
tocar nada más: ni el molde ni los egresos dependen de ellos.
