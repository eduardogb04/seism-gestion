# ADR 0041 — Modalidades de facturación, cuota mensual y lo devengado

**Fecha:** 2026-10-18
**Estado:** Propuesto
**Tarea:** F3-03
**Decide:** el plan (F3-03) y el orquestador (R1 a R17 de la ficha); el número lo fijó la ficha (0040 es de F3-05)

## Contexto

Hasta F3-03 un servicio se facturaba contra su orden de compra sin decir cómo: no había forma de saber cuánto estaba
devengado ni cuánto faltaba facturar. La tanda define tres modalidades —puntual, por hitos (libre) y mensual—, y de lo
devengado salen las pantallas de facturación y el inicio. Además quedaba pendiente desde F3-01 qué pasa con el servicio
al anular su orden de compra.

## Decisión

La modalidad de facturación es una columna del servicio y lo devengado se calcula, no se guarda: una función pura del
dominio (`devengadoPorMoneda`, `src/dominio/servicios/devengado.ts`) recibe la modalidad, el estado, la orden, las
facturas vigentes, las cuotas y **la fecha**, y devuelve por moneda devengado, facturado y por facturar.

- **Columna `servicios.modalidad_facturacion`** (`puntual` | `por_hitos` | `mensual`, nula sin elegir). No es
  `servicios.modalidad` (puntual/recurrente del contrato), que no se toca. Se elige o se cambia en «Adjudicado» y «En
  ejecución» (la carga `modalidad` de `ETAPAS_DE_CARGA`, `DOM-0018` fuera de ahí) y solo sin facturas vigentes
  (`DOM-0019`). Sin modalidad no se factura (`DOM-0021`). La migración deja «Por hitos» a los servicios que ya tenían
  alguna factura (vigente o anulada): ahí lo devengado es lo facturado y sus números no cambian.
- **En qué etapa se factura** (`admiteFactura`, al lado de `ETAPAS_DE_CARGA`): puntual, en «Finalizado»; por hitos, de
  «Adjudicado» a «Finalizado» (la regla de F3-01); mensual, en «En ejecución» y «Finalizado». Anular una factura sigue la
  regla de F3-01.
- **Las reglas.** Puntual: 0 hasta «Finalizado»; en «Finalizado» y «Cerrado», el total de la orden. Por hitos: devengado =
  facturado y por facturar = **saldo de la orden** (`saldoDeOrden` de F2-06, con todas las facturas vigentes del
  servicio: hay una sola orden por servicio). Mensual: la suma, mes a mes desde el de inicio hasta el de la fecha
  inclusive, de la cuota vigente en cada mes, con tope en el total de la orden. En puntual y mensual por facturar =
  devengado − facturado y puede ser negativo. Sin modalidad, nada devengado.
- **La cuota mensual** es una tabla aparte, `servicios_cuotas`, que solo se agrega: la cuota inicial (su mes es el de
  inicio) y cada ajuste, con el mes desde el que rige (siempre el día 1), el importe sin IVA en la moneda de la orden
  (se muestra, no se elige) y una `posicion` de carga. En un mes rige la del ajuste de mes más cercano anterior o
  igual; dos del mismo mes, la última cargada (por eso la `posicion`: con un reloj fijo dos filas tienen el mismo
  `creado_en`). Un ajuste no puede regir desde un mes anterior al del reloj inyectado ni al de inicio (`DOM-0020`, en
  el caso de uso): así nunca cambia lo devengado de un mes pasado. Solo en mensual (`DOM-0022`). Cambiar de modalidad da
  de baja (baja lógica) las cuotas.
- **La factura del mes.** `facturas.periodo` (día 1, nula fuera de mensual) es obligatoria en mensual. El formulario
  propone el mes más antiguo, desde el inicio hasta el del reloj, sin factura vigente con ese período (si están todos,
  el del reloj) y la cuota que rige en él; los dos se editan y se guarda lo escrito.
- **Anular la orden de compra** (solo en «Adjudicado», y sin facturas vigentes por `DOM-0014`) vuelve el servicio a
  «Cotizado» en la misma transacción: transición automática con la causa `anulacionDeOrdenDeCompra`. La modalidad y las
  cuotas quedan como estaban.
- **Lo que se ve** (sección *Facturación* de la pantalla del servicio): la modalidad, el historial de la cuota y, por
  moneda y al mes del reloj, devengado, por facturar, saldo de la orden (F2-06) y por cobrar (el saldo de cada factura,
  F2-07). Antes de confirmar un ajuste, al lado de los campos, el aviso «El cambio vale desde <mes> en adelante; no
  cambia lo ya devengado» (un hijo de cliente de `FormularioAbm`, como el IVA en vivo de F2-06).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Guardar lo devengado de cada mes | Se desacomoda con cada ajuste o anulación; calcularlo con la fecha alcanza y es una función pura con propiedades |
| La cuota como columnas del servicio | Un ajuste pisaría la cuota de los meses de antes: lo devengado de un mes pasado cambiaría |
| Ordenar las cuotas por `creado_en` | Dos cargas en el mismo instante (un reloj fijo, en los tests) quedan sin orden: la `posicion` lo fija |
| Que en un mes rija el último ajuste cargado, sea del mes que sea | Un ajuste desde agosto cargado después de uno desde septiembre borraría el de septiembre sin decirlo |
| Elegir la moneda de la cuota | Con una sola orden por servicio, otra moneda dejaría el tope sin sentido |
| Un campo de mes nuevo en el molde (`<input type="month">`) | Más código en `_ui` para algo que el selector de día cubre: se toma el mes del día elegido |
| Dejar el servicio en «Adjudicado» sin orden vigente | Quedaría adjudicado sin nada contra qué facturar ni de dónde sacar la moneda de la cuota |

## Consecuencias

- La pantalla por etapa (F3-06) y el inicio leen `devengadoPorMoneda`: no repiten la cuenta. El saldo de la orden y el
  por cobrar salen de `saldoDeOrden` y de `conCobrosDe` (F2-06, F2-07), no de otra implementación.
- Facturar exige modalidad: los tests que facturan sin probar la modalidad la ponen con `conModalidad` del arnés.
- Prorrateo de días dentro de un mes, facturación extraordinaria y notas de crédito no entran.
- Lo hacen cumplir: las cuatro propiedades de `tests/dominio/devengado.test.ts` (fast-check, 1000 corridas como mínimo,
  cada una vista fallar con una mutación), `tests/casos-uso/facturacion.test.ts` (cada regla con base real y reloj
  fijo), `tests/dominio/aviso-de-ajuste.test.ts` (el aviso, dibujado),
  `tests/casos-uso/migracion-modalidades-de-facturacion.test.ts` y el test de migraciones.

## Cómo se revierte

`npm run db:migrate:down` revierte la migración (borra la tabla de cuotas, la modalidad y el período). En el código:
`devengado.ts`, la carga `modalidad`, `admiteFactura` y la causa `anulacionDeOrdenDeCompra` de `estados.ts`,
`exigirEtapaDeFactura` (`ciclo.ts`), `facturacion.ts`, el período en `facturas.ts` y la sección `facturacion.tsx`.
