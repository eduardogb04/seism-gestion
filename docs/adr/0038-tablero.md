# ADR 0038 — El tablero: qué cuenta cada número y por qué lo suma la base

**Fecha:** 2026-10-15
**Estado:** Aprobado
**Tarea:** F2-10
**Decide:** el plan (F2-10) y el orquestador (R1 a R15 de la ficha). Las definiciones de *devengado* se confirman con Eduardo en el corte.

## Contexto

El dolor n.º 1 del relevamiento: no se sabe cuánto entra y cuánto sale. La pantalla de inicio tiene que contestarlo por mes y por
moneda, sin mezclar pesos con dólares, y cada número tiene que cerrar con el listado al que lleva.

## Decisión

**Cada número se define una vez, lo suma PostgreSQL y lleva a un listado que suma lo mismo.**

- **Del mes elegido** (`?mes=AAAA-MM`, por defecto el del reloj inyectado; uno inválido muestra el actual y lo avisa; tramos de días
  con el último excluido):
  - *Facturado*: facturas vigentes con fecha en el mes, sin IVA y con IVA.
  - *Cobrado*: cobros vigentes con fecha en el mes, **importe más retención**, en la moneda de la factura.
  - *Egresos*: egresos vigentes con fecha en el mes, de todas las clases.
  - *Pagado*: pagos vigentes con fecha en el mes, en la moneda del egreso.
  - *Resultado de caja*: cobrado menos pagado.
  - *Resultado devengado*: facturado **sin IVA** menos los egresos de las clases `proyecto` y `gestion_administrativa`.
    `fuera_de_rentabilidad` no entra y se muestra aparte, en su bloque de *Egresos por centro de costo*.
- **A la fecha del reloj** (no del mes): *pendiente de cobro* (saldo con IVA de las facturas con saldo, la misma consulta que
  *Por cobrar*) y *pendiente de pago* (saldo de los egresos con saldo, la misma que *Por pagar*). *Vencido* es la parte con
  vencimiento anterior a hoy; un egreso sin vencimiento no vence. Estas dos consultas ya existían: `facturasPorCobrar` se extrajo de
  `porCobrar` para que el tablero y la pantalla usen **la misma**, y *Por cobrar* sigue calculando el saldo en JS (no es de este ADR).
- **De siempre, por servicio y moneda:** *rentabilidad* = facturado sin IVA menos los egresos de centros de clase `proyecto`
  imputados al servicio.
- **Sin conversión:** cada total es de una moneda; una moneda sin movimientos en el mes no aparece.
- **La base suma** (`RepositorioTablero`, `$queryRaw` tipado con Zod en el borde): `SUM`/`GROUP BY` por moneda. El IVA se calcula
  con `ivaDe` del dominio **por factura**: la base agrupa las facturas por moneda, alícuota e importe y el caso de uso multiplica el
  IVA de uno por la cantidad. Sumar primero y redondear después da distinto con medio centavo (tres facturas de 0,50 al 21 %: 0,11 ×
  3 = 0,33 contra 0,32), y el listado muestra el IVA de cada una.
- **Cada número lleva a su listado:** `/servicios/facturas`, `/servicios/cobros` y `/egresos/pagos-hechos` (nuevos, de solo
  lectura, con mes y moneda en la URL y el total al pie), `/egresos?fecha=AAAA-MM[&centroCostoId=…]`, `/servicios/por-cobrar`,
  `/egresos/pagos` y `/servicios/<id>`. Los resultados son una resta de otros números y no llevan enlace.
- **El inicio es `/`** y exige sesión como cualquier otra pantalla (`sesionExigida`).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Sumar en JS sobre todas las filas | Es lo que el criterio prohíbe: crece con los datos y puede discrepar de la base |
| IVA agrupado por alícuota y redondeado una vez | No cierra con la suma de las facturas con medio centavo |
| Facturado con IVA para el resultado devengado | El IVA no es ingreso: distorsiona el resultado |
| Una vista materializada | Un objeto más que mantener y refrescar; el volumen no lo pide |
| Convertir a una moneda con un tipo de cambio | Fuera de alcance de la tarea (*Qué NO entra*) |

## Consecuencias

- Se gana un único lugar donde se define cada número, y un test que compara cada uno con la suma de su listado
  (`tests/casos-uso/tablero.test.ts`).
- El listado de egresos del molde no filtra por moneda y no tiene pie: el enlace de *Egresos* filtra por mes (y centro) y muestra
  las dos monedas.
- Los listados nuevos no paginan: traen el mes entero de una moneda.
- Sin migración: no hace falta un índice a este volumen; si las consultas se vuelven lentas, un índice sobre `fecha` va en su propia
  migración.

## Cómo se revierte

Se borran `src/casos-uso/tablero/`, el puerto y el adaptador `tablero`, las tres pantallas de listado, y `src/app/page.tsx` vuelve
a la página fija. `facturasPorCobrar` queda como función de `cobros.ts` sin cambiar el comportamiento. No hay datos que migrar.
