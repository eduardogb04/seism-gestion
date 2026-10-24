# ADR 0039 — El recorrido del servicio por etapas

**Fecha:** 2026-10-16
**Estado:** Propuesto
**Tarea:** F3-01
**Decide:** Eduardo (el recorrido de F3, cabecera de la tanda) y el orquestador (R1 a R12 de la ficha); reemplaza al ADR 0033 en lo que hace al ciclo de estados

## Contexto

El ciclo de F2-04 (solicitado → cotizado → adjudicado → vigente → cerrado, ADR 0033) dejaba pasar a mano de un estado
a otro y no limitaba qué se cargaba en cada uno. Eduardo definió otro recorrido, del que salen las pantallas por etapa
(F3-06) y la facturación de la tanda: unos pasos los da la persona, otros los da lo que se carga, y cada etapa dice qué
se puede cargar.

## Decisión

El estado sigue siendo el último evento de `servicios_eventos` (ADR 0010) y cambia solo por el dominio
(`src/dominio/servicios/estados.ts`), con nueve estados: `creado`, `cotizado`, `adjudicado`, `en_ejecucion`,
`finalizado`, `cerrado`, `perdido`, `sin_respuesta` y `cancelado`.

- **Automáticas** (`porCausa`, solo las dispara su causa, en la misma transacción): creado → cotizado al cargar una
  cotización; cotizado → adjudicado al cargar una orden de compra; finalizado → cerrado cuando hay al menos una
  factura vigente y todas tienen saldo cero (`todoCobrado`, sobre `saldoDe`: la retención cancela deuda). El cierre se
  mira al registrar un cobro y al «Finalizar servicio».
- **Manuales** (`pedirCambio`, el botón de la pantalla por `cambiarEstado`): cotizado → perdido / sin_respuesta /
  cancelado; sin_respuesta → cotizado; adjudicado → en_ejecucion («Iniciar ejecución»); en_ejecucion → finalizado
  («Finalizar servicio»); creado / adjudicado / en_ejecucion → cancelado. Pedir a mano una automática, o cualquier otra,
  es `DOM-0011`; perder, dejar sin respuesta o cancelar sin motivo es `DOM-0017`.
- **Etapas** (`admiteCarga`, una tabla): cotizaciones en creado y cotizado; la orden de compra en cotizado; facturas en
  adjudicado, en ejecución y finalizado; cobros y sucesos en cualquiera menos cerrado. Anular sigue la regla del alta,
  salvo la orden de compra, que se anula en adjudicado (cargarla lo deja ahí: si se anulara solo en cotizado, no se
  anularía nunca). Cada caso de uso toma la fila del servicio y lo consulta (`exigirEtapa`, `src/casos-uso/servicios/
  ciclo.ts`) antes de escribir; afuera es `DOM-0018` y no se escribe nada, tampoco el archivo en el almacén.
- **Sucesos**: tabla `servicios_sucesos` (día, texto; el autor es `creado_por`). No se editan: se anulan con baja lógica
  y un motivo obligatorio (`motivo_anulacion`).
- **Tiempo en cada etapa**: `diasPorEtapa` (días civiles de un evento al siguiente, el último hasta hoy); la pantalla
  lo muestra en la columna «Días» del historial.
- **Migración** `20261016100000_recorrido_por_etapas`: renombra en `de` y `a` solicitado → creado y vigente →
  en_ejecucion; no agrega ni borra eventos. Un historial viejo con saltos que hoy no se permiten se lee igual: el
  estado actual es el último evento y no se revalida el pasado.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Una columna `estado` en `servicios` | El estado es el historial (ADR 0010); una columna se desincroniza y pierde las fechas |
| Marcar en la tabla de transiciones cuál es automática, por estado | Las automáticas son tres, una por causa: la tabla `causa → de, a` lo dice directo y `porCausa` no puede equivocarse de destino |
| Revalidar el historial al leerlo | Hay historiales de antes con saltos que hoy no se permiten (`solicitado → perdido`); revalidar los dejaría sin pantalla |
| Limitar la carga solo en la pantalla | Una acción llamada a mano (o una pantalla vieja abierta) escribiría igual; la regla va en el caso de uso, con la fila tomada |
| Una columna `autor` en sucesos | Es `creado_por`, que ya escribe el molde con el `Actor` |

## Consecuencias

- Las pantallas por etapa (F3-06) leen `transicionesManualesDesde` y `admiteCarga`: no repiten reglas.
- Una sola orden de compra por servicio en el recorrido normal (entra solo en cotizado y lo adjudica). Si hiciera
  falta más de una, se decide en F3-03 (modalidades).
- F3-03 (ADR 0041) suma la carga `modalidad` (elegirla y ajustar la cuota, en «Adjudicado» y «En ejecución»), decide en qué etapas se factura con cada
  modalidad y agrega la transición automática «Adjudicado» → «Cotizado» al anular la orden de compra.
- El `down.sql` lleva `finalizado` a `vigente`: un evento en_ejecucion → finalizado queda vigente → vigente. Pérdida
  aceptada; los eventos, sus fechas y sus autores quedan. Los sucesos se pierden con su tabla.
- Lo hacen cumplir: la propiedad de `tests/dominio/servicios-estados.test.ts` (secuencias de acciones contra una
  tabla escrita aparte, 1000 corridas), `tests/casos-uso/etapas.test.ts` (cada regla de etapa y el cierre, con base
  real), `tests/casos-uso/migracion-recorrido-por-etapas.test.ts` y el test de migraciones.

## Cómo se revierte

`npm run db:migrate:down` revierte la migración. En el código: la tabla de `estados.ts` (transiciones, causas y
etapas), `ciclo.ts`, y las llamadas a `exigirEtapa`, `cambiarPorCausa` y `cerrarSiEstaCobrado` en los casos de uso de
cotizaciones, órdenes de compra, facturas, cobros, sucesos y servicios.
