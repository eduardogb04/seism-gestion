# ADR 0049 — Plantillas de hitos y la modalidad fija

**Fecha:** 2026-10-29
**Estado:** Propuesto
**Tarea:** F6-02
**Decide:** Eduardo (relevamiento del 2026-10-29: modalidad fija en «Adjudicado», hitos desde plantillas, recursos humanos y
materiales) y el orquestador (R1 a R9 de la ficha de F6-02; a confirmar por Eduardo)

## Contexto

Los hitos de un servicio se cargaban de a uno. Eduardo pidió que salgan de plantillas genéricas o de su tipo de servicio,
con hitos propios encima; que los recursos se separen en humanos y materiales; y que la modalidad de facturación se fije en
«Adjudicado», no se cambie con el servicio en marcha. Hasta F6-02 la carga `modalidad` valía en «Adjudicado» y «En ejecución»
y servía tanto para elegir la modalidad como para ajustar la cuota mensual.

## Decisión

**Las plantillas son un ABM del molde (ADR 0031) cuya lista de hitos va en una tabla hija, `plantillas_hitos_items`, y
se copian a los servicios como hitos propios.**

- `plantillas_hitos` (nombre único sin distinguir mayúsculas entre las vigentes, tipo de servicio opcional: sin tipo es
  genérica) e `plantillas_hitos_items` (`orden` desde 1 y `texto`). Para el molde la plantilla es una sola fila con
  `hitos: readonly string[]`: un campo nuevo, `lista` (`CampoAbm`, control `CampoLista`: agregar, quitar, subir y bajar), y
  una tabla que el repositorio ve con sus ítems incluidos y, al guardar, reemplaza entera en la misma escritura
  (`tablaDePlantillas`). La auditoría guarda la lista de antes y la de después. Una plantilla lleva al menos un hito.
- Aplicar una plantilla (`crearHitosDePlantilla`, en «Adjudicado» y «En ejecución») crea un `servicios_hitos` por ítem, al
  final de los del servicio, sin guardar a qué plantilla corresponden: cambiarla o darla de baja después no los toca. El
  selector ofrece primero las plantillas del tipo del servicio y después las genéricas; las de otro tipo no.
- Los hitos propios se reordenan (`cambiarOrdenDeHito`: intercambia el lugar con el vecino) y se quitan mientras no estén
  realizados (`DOM-0039`), en las mismas dos etapas.
- Un recurso suma el tipo *Material* (descripción obligatoria, `cantidad` de texto libre opcional, hasta 100 caracteres, solo
  en materiales). En pantalla se agrupan en *Humanos* (persona) y *Materiales* (camión, equipo, material).
- **La modalidad se fija en «Adjudicado».** La carga `modalidad` (elegirla o cambiarla) queda solo en «Adjudicado»; la carga
  nueva `cuota` (ajustar la cuota mensual) sigue en «Adjudicado» y «En ejecución». Pasar a «En ejecución» sin modalidad es
  `DOM-0038` y no escribe nada.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Los hitos como una columna `jsonb` de la plantilla | Es lo más corto, pero la fila deja de ser relacional y el resto del catálogo y los sitios de un servicio (ADR 0033) guardan los conjuntos en tablas |
| Una pantalla propia para editar los hitos de la plantilla | La lista se edita en el mismo formulario que el nombre; un segundo paso es más lento y deja plantillas sin hitos |
| Guardar a qué plantilla corresponde cada hito copiado | Ataría los servicios a la plantilla; el pedido es que cambiarla después no toque lo ya aplicado |
| Una tercera carga para el aviso de «cambiar la modalidad en ejecución» | La modalidad fija es una regla de etapa, no de aviso: se rechaza con `DOM-0018` como cualquier carga fuera de su etapa |

## Consecuencias

- Se gana un lugar único para los hitos recurrentes, y recursos que distinguen personas de materiales.
- La modalidad ya no cambia con facturas en marcha por esta vía de «En ejecución»; el que necesite cambiarla tiene que
  haberla fijado antes. Un servicio llevado a «En ejecución» antes de F6-02 sin modalidad sigue en esa etapa sin poder
  elegirla (no se pueden emitir facturas, `DOM-0021`, como hasta ahora).
- Un campo `lista` más en el molde y un repositorio que conoce una tabla hija: se evita para el resto de los ABM.
- Lo hacen cumplir `tests/casos-uso/planificacion.test.ts` y `abm-plantillas-de-hitos.test.ts`,
  `tests/casos-uso/facturacion.test.ts`, `tests/dominio/servicios-estados.test.ts`, el test de migraciones y
  `tests/e2e/plantillas-de-hitos.spec.ts`.

## Cómo se revierte

`down.sql` de `20261029110000_plantillas_y_material` borra las dos tablas y la columna `cantidad` (las plantillas y las
cantidades cargadas no vuelven); se quita la entrada de `DEFINICIONES`, el campo `lista`, y en `estados.ts` la carga
`cuota` vuelve a ser la misma `modalidad` de «Adjudicado» y «En ejecución».
