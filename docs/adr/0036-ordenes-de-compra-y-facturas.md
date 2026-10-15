# ADR 0036 — Órdenes de compra y facturas: el IVA se calcula y no se guarda, el saldo puede ser negativo y las monedas no se mezclan

**Fecha:** 2026-10-15
**Estado:** Aprobado
**Tarea:** F2-06
**Decide:** el plan (F2-06), Eduardo (2026-10-01: el IVA y el total se calculan solos; notas de crédito afuera) y el orquestador (R2 a R17 de la ficha)

## Contexto

La orden de compra adjudica el servicio y fija el total contra el que se factura y, después, se cobra. Se carga poco
(número, fecha, importe, observaciones y, si se quiere, el documento); las facturas se cargan contra ella, parciales.
Había que decidir qué se guarda de una factura, dónde vive la cuenta del IVA, cómo se compara lo facturado con la
orden y qué pasa cuando las monedas no coinciden o se factura de más. Lo que se cobra (F2-07) es el total con IVA.

## Decisión

**Se guarda lo que se carga, y lo que se deduce se calcula siempre.** Una factura guarda el importe **sin IVA** (dos
columnas, centavos `BigInt` y moneda, como las cotizaciones y los egresos) y la alícuota en milésimas (`210`, `105` o
`0`). El IVA y el total con IVA **no son columnas**: salen de `ivaDe` y `totalConIva`
(`src/dominio/servicios/factura.ts`), que son la única cuenta, en el listado, mientras se carga y, desde F2-07, al
cobrar. El IVA es `centavos × alícuota / 1000` redondeado al centavo con la función de redondeo que ya tenía el dominio
(`redondearMitadLejosDelCero` de `importe.ts`, ahora exportada: la mitad se aleja del cero); el total es la base más ese
IVA, exacto, sin un segundo redondeo.

- **Dos tablas nuevas**, `ordenes_de_compra` y `facturas` (migración `20261015100000_ordenes_de_compra_y_facturas`),
  auditables y de baja lógica. El documento es opcional en las dos (`documento_id` nulo; el resto del mecanismo es el de
  `docs/adr/0035-documentos-adjuntos.md`). La factura apunta, si se quiere, a su orden de compra (`orden_compra_id`),
  que tiene que ser una vigente del mismo servicio: el selector solo ofrece esas y el caso de uso rechaza cualquier otra
  con un error de campo. **El número de factura es único entre las vigentes** (índice parcial sobre `lower("numero")`
  `WHERE eliminado_en IS NULL`, a mano en la migración); el caso de uso lo mira antes y el índice es la red de
  seguridad (dos altas a la vez: una vuelve con el mensaje en el campo o se rechaza con `DOM-0008`, nunca un error
  crudo). Anulada una factura, su número queda libre.
- **El saldo por facturar compara importes sin IVA** (`saldoDeOrden`, `src/dominio/servicios/orden-compra.ts`): total de
  la orden, facturado (las facturas vigentes de **la misma moneda** que apuntan a ella) y saldo = total − facturado.
  **El saldo puede ser negativo**: se factura de más por ajustes y adicionales, así que la factura se guarda igual y la
  fila de la orden avisa, sin error, «Se facturó X más que la orden de compra». Por eso no se reutilizó `pagar` de
  `saldo.ts`, que rechaza el exceso (sí se reutilizan `sumarEnMoneda` y `restarEnMoneda`, ahora exportadas).
- **Las monedas no se mezclan.** La orden y la factura tienen moneda propia; una factura en otra moneda que su orden no
  suma a su facturado (no hay tipo de cambio) y se muestra aparte, con su número, bajo *Facturado*. Nada se convierte de
  forma implícita. La pantalla propone para la factura la moneda de la última orden, pero no la hereda.
- **Cargar una orden de compra pasa el servicio a «Adjudicado» solo si el ciclo del dominio lo permite desde su estado
  actual** (hoy, desde «Cotizado»), en la misma transacción y por `registrarCambioDeEstado`, con la nota
  `Orden de compra <número> cargada`. En cualquier otro estado la orden se guarda y el estado no cambia; anular no lo
  devuelve.
- **Ni la orden ni la factura se editan: se anulan** (baja lógica, con su documento). **Una orden con facturas vigentes
  no se anula** (`DOM-0014`): primero se anulan sus facturas.
- **El IVA se ve mientras se carga.** `FormularioAbm` (cliente) lleva lo escrito en un contexto
  (`useEscritoEnVivo`) y la ventana de la factura le pone un hijo, `IvaEnVivo`, que lo lee y muestra el IVA y el total
  con `ivaYTotalEscritos` (`src/casos-uso/servicios/iva-de-factura.ts`, que solo lee el texto y da formato: la cuenta es
  la del dominio). La pantalla no repite la cuenta. El proyecto no incluye los tipos del DOM, así que el formulario mira
  el control que cambió por lo que trae (nombre y valor) en vez de leer el formulario.
- **El molde de ABM aprende `opcional` en `opcion`**: un selector cuya lista ofrece *Ninguna* y vacío es `null` (la orden
  de compra de una factura es la primera). Es un cambio de dos líneas en `valorDeCampo`, `validarEscrito` y el control.
- **Un archivo vacío que manda el navegador cuando no se eligió ninguno** llega a la Server Action como `blob` de 0
  bytes; `archivoDe` (`src/app/servicios/acciones.ts`) lo lee como «no se eligió». Para el documento opcional es lo que
  hace falta; en una cotización, que lo exige, vuelve el mensaje «Elegí el documento».

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Guardar el IVA y el total en la factura | Pueden quedar desparejos de la alícuota o del importe; hay que mantener dos cuentas. Con calcularlos no hay nada que sincronizar. |
| Guardar el importe con IVA y sacar el IVA hacia atrás | El redondeo del IVA hacia atrás no vuelve a la base que se cargó; la persona carga el importe sin IVA y es lo que se compara con la orden. |
| Calcular el IVA en el navegador con otra función | Dos cuentas que pueden diferir en un centavo. El navegador usa la misma función del dominio. |
| Rechazar la factura que pasa el saldo de la orden | Hay ajustes y adicionales; avisar y dejar pasar es lo que se pidió. |
| Convertir las facturas en otra moneda con un tipo de cambio | No hay tipo de cambio cargado en la factura ni en la orden; convertir sería inventar un dato de plata. |
| Dar de baja una orden con facturas y dejar las facturas sin orden | Deja facturas que antes apuntaban a un total que ya no existe. |
| Una tabla de facturas por orden de compra (la factura siempre cuelga de una orden) | Se factura también sin orden (servicios sin orden formal); la orden es opcional. |

## Consecuencias

- Se gana una sola cuenta del IVA para toda la plata del servicio, con propiedades (total = base + IVA exacto, IVA ≥ 0,
  monotonía, medio centavo hacia arriba) y un saldo que nunca esconde un exceso.
- Un cambio de alícuota (una cuarta, o una alícuota que cambie) es sumarla a `ALICUOTAS_IVA`; las facturas viejas
  guardan su alícuota y no se recalculan con otra.
- Una factura de otra moneda que su orden no baja el saldo hasta que haya tipo de cambio: se ve, no se pierde.
- Queda por decidir cómo se cobra (F2-07) lo facturado en otra moneda; este ADR deja el total con IVA calculable.
- **El cruce factura ↔ anulación de su orden está cerrado.** Cargar una factura, anular una orden y dar de baja un
  servicio toman la fila del servicio (`RepositorioServicios.bloquear`, `FOR UPDATE`, como `siguienteVersion` de las
  cotizaciones) y vuelven a mirarla ya con el bloqueo (`servicioVigenteBloqueado`); la factura valida su orden después
  de tomarla, así que nunca queda una factura vigente apuntando a una orden anulada (si la orden se anuló antes, vuelve
  el error de campo en la orden; si la factura entró antes, la anulación da `DOM-0014`). Lo prueba un test de
  concurrencia (`tests/casos-uso/ordenes-y-facturas.test.ts`).
- **Un servicio con órdenes de compra o facturas vigentes no se da de baja**, cualquiera sea su estado (`DOM-0010`,
  después de la regla del estado): una factura puede cargarse en «Solicitado», donde la baja estaba permitida.
- Lo hacen cumplir `tests/dominio/factura.test.ts` y `orden-compra.test.ts` (propiedades), `tests/casos-uso/ordenes-y-facturas.test.ts`
  (contra Postgres) y `tests/e2e/ordenes-y-facturas.spec.ts`.

## Cómo se revierte

La migración tiene su `down.sql` (las dos tablas). El resto es `src/dominio/servicios/{factura,orden-compra}.ts`, los dos
casos de uso, las dos secciones de `src/app/servicios/[id]/` y la semilla; el cambio al molde (`opcional` en `opcion`)
y el contexto de `FormularioAbm` quedan sin uso y se pueden sacar sin tocar otra cosa.
