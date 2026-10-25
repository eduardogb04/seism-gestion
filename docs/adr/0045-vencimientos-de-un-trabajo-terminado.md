# ADR 0045 — Los vencimientos nacen al finalizar el servicio: uno por camión, por sitio o por servicio

**Fecha:** 2026-10-25
**Estado:** Propuesto
**Tarea:** F4-02
**Decide:** el plan (F4, D1 y D3; a confirmar por Eduardo)

## Contexto

F4-01 dejó la regla (en el tipo de servicio) y la función que da la fecha. Faltaba decidir
cuándo se calcula, cuántos vencimientos tiene un trabajo y qué se puede hacer con ellos a mano.

## Decisión

Los vencimientos son filas propias (`servicios_vencimientos`, migración
`20261025120000_vencimientos`) y se **generan en la misma transacción** que pasa el servicio a
«Finalizado», con `fechaDeVencimiento` y el día del cambio a medianoche (`sumarMeses` conserva la
hora).

- **Uno por qué (D3):** uno por **camión** asignado (los recursos de tipo camión del servicio, sin
  repetir); si no hubo camiones, uno por **sitio**; si tampoco, uno por **servicio**. Si el tipo
  no tiene plazo, ninguno. Lo decide `objetivosDeVencimiento` (dominio) y lo escribe
  `generarVencimientos` (`generacion-de-vencimientos.ts`), que llama `cambiarEstado` justo después
  de `pedirCambioDeEstado`: si el cambio se rechaza no se genera nada, y si no se pueden guardar el
  servicio no queda finalizado.
- **La fila:** servicio (obligatorio), sitio o camión (a lo sumo uno, CHECK), fecha, descripción,
  origen (`calculado` o `manual`, CHECK) y estado (`pendiente`, `renovado` o `descartado`, CHECK),
  más motivo de descarte, auditoría y baja lógica como el resto de las tablas.
- **A mano**, solo en «Finalizado» (nueva carga `vencimiento` de `estados.ts`; en «Cerrado» se
  ven): corregir la fecha la pasa a origen `manual` y la auditoría guarda el valor anterior; se
  agrega uno (origen `manual`) y se descarta uno con motivo. Solo se corrige o se descarta uno
  `pendiente` (`DOM-0029`). `renovado` lo pondrá «Cotizar renovación», que no entra acá.
- **Volver de «Finalizado»:** el ciclo no tiene esa salida, así que no se da de baja nada. Si algún
  día existe, esa transición da de baja los calculados que sigan pendientes.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un solo vencimiento por servicio, con la fecha más próxima | El camión es lo que se renueva: cada uno tiene su fecha, según su antigüedad |
| Calcular la fecha al mostrarla, sin guardar nada | Una corrección a mano no tendría dónde vivir, ni el calendario y los avisos de F4 de dónde leer |
| Generar desde un job del worker | Dejaría un rato al servicio finalizado sin vencimientos; la transacción lo evita |

## Consecuencias

- Se gana: la fecha sale siempre de una función; nada de lo cargado a mano se pisa.
- Se pierde: un servicio ya finalizado antes de esta tarea no tiene vencimientos calculados.
- Lo hacen cumplir `tests/casos-uso/vencimientos.test.ts` (generación, atomicidad, corrección y
  descarte, etapas) y `tests/dominio/objetivos-de-vencimiento.test.ts`.

## Cómo se revierte

`down.sql` borra la tabla; se quita la llamada en `cambiarEstado` y la sección «Vencimientos».
