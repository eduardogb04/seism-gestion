# ADR 0047 — Los documentos de alcance son un dueño más de `documentos`

**Fecha:** 2026-10-25
**Estado:** Propuesto
**Tarea:** F5-01
**Decide:** el orquestador (R4 de la ficha de F5-01; a confirmar por Eduardo)

## Contexto

DISENO pide en «Creado» la documentación de alcance del servicio. Hasta F4 los adjuntos colgaban de las
cotizaciones, las órdenes de compra, las facturas, los egresos y los cobros (ADR 0035): un servicio recién creado
no podía tener ninguno, porque cargar la primera cotización lo pasa a «Cotizado».

## Decisión

**Una tabla dueña `servicios_documentos` (`servicio_id`, `documento_id`, auditable), con el molde de F2-05.** No es
otra tabla de documentos: los bytes, el metadato, la validación, el tope y la descarga son los de siempre
(`registrarDocumento`, `validarArchivo`, `EnlaceDeDescarga`, `GET /documentos/<id>`). Se cargan en «Creado» y en
«Cotizado» (carga `alcance`, una fila más de `admiteCarga`) y se ven en solo lectura en las etapas pasadas. Solo se
agregan y se listan: sin anulación, porque nadie la pidió.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Una columna `documento_id` en `servicios` | Admite un solo documento y reemplazarlo pierde el anterior; la spec habla de documentos, en plural |
| Mostrar el documento de cada cotización como «alcance» | En «Creado» no hay cotización: no se cumple el criterio |
| Columnas polimórficas en `documentos` | Sin clave foránea; ya descartado en el ADR 0035 |

## Consecuencias

- Se gana un lugar para el alcance antes de cotizar, con la misma validación y descarga que el resto.
- Una tabla más y un repositorio más en `RepositoriosEnTransaccion`.
- Lo hacen cumplir `tests/casos-uso/etapas.test.ts` (etapas, archivo rechazado, nada escrito fuera de etapa),
  `tests/dominio/servicios-estados.test.ts` y `tests/e2e/etapas.spec.ts`.

## Cómo se revierte

`down.sql` de `20261025150000_documentos_del_servicio` borra la tabla (los `documentos` quedan sin dueño); se quita
la sección de `etapas.tsx` y la carga `alcance`.
