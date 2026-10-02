# ADR 0033 — Servicios: fuera del molde de ABM, con sus piezas

**Fecha:** 2026-10-02
**Estado:** Aprobado
**Tarea:** F2-04
**Decide:** el plan (F2-04) y Eduardo (R1 a R16 de la ficha); DISENO (sección 2, decisiones 2 y 6); ADR 0010 (historial), ADR 0031 y 0032 (molde)

## Contexto

El servicio es el acuerdo con el cliente, y de él van a colgar cotizaciones, órdenes de compra y facturas. Es la
primera entidad que no es un catálogo: su código lo genera el sistema, su estado es un ciclo con historial, abarca
varios sitios y tiene pantalla propia. El molde de ABM (ADR 0031) resuelve registros de una fila que se listan, se
editan y se dan de baja; había que decidir cuánto de Servicios entra ahí.

## Decisión

**Servicios no es una entrada de `EntidadesAbm`: tiene su puerto, su adaptador y sus casos de uso, y reutiliza del
molde las piezas que se pueden llamar sueltas.** Meterlo en `DefinicionAbm` pedía ganchos que solo usaría Servicio
(un campo que no se escribe, un estado que no es columna, una relación de muchos, una baja condicionada, una pantalla
de detalle).

- **Qué se reutiliza, sin copiar.** Los tipos de campo y su validación (`validarEscrito`, con los `CamposAbm` de
  `src/casos-uso/servicios/formulario.ts`), las relaciones y su `soloSi` (`relacionesRotas`, `elegiblesDe`,
  `opcionesDe`), los parámetros del listado (`parametrosDe`), el formato de fechas y de quién (`cuandoDe`,
  `nombresDeActores`): eran funciones privadas de `src/casos-uso/abm/abm.ts` atadas a una definición y pasaron a
  recibir los campos. En el adaptador, leer uno y escribir con auditoría (`crearEscrituraPrisma`) salió de
  `crearRepositorioConConversion`, que ahora lo usa. En la pantalla, `ListadoAbm` recibe cabeceras, órdenes y las
  acciones de cada fila en vez de una definición, y `FormularioAbm` y `Ventana` se usan tal cual.
- **Qué es propio.** `RepositorioServicios` (`src/puertos/repositorios/servicios.ts`): el listado con lo que se
  muestra de cliente, tipo, responsable y estado, los eventos, los sitios y `usa`. Los casos de uso
  (`src/casos-uso/servicios/servicios.ts`) y las pantallas `/servicios` y `/servicios/<id>`.
- **El estado es el último evento, no una columna.** `servicios_eventos` (servicio, posición, de, a, cuándo, actor,
  nota) solo se agrega. La regla vive en `src/dominio/servicios/estados.ts` sobre `definirCiclo` (ADR 0010): el caso
  de uso arma el historial desde la base, le pide al ciclo el cambio y guarda el evento que el ciclo devuelve. La
  clave primaria `(servicio_id, posicion)` hace que de dos cambios simultáneos desde el mismo estado entre uno solo;
  el otro es `DOM-0011`, igual que una transición que el ciclo no declara o una baja fuera de «Solicitado».
- **El código sale de la base.** `secuencias` tiene una fila por prefijo y año. `siguiente` es un solo
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`: el segundo escritor espera la fila del primero. Se pide dentro de
  la transacción del alta (`RepositoriosEnTransaccion.secuencias`), así que un alta que falla no gasta número. El año
  es el del reloj inyectado. `servicios.codigo` es único.
- **Los sitios son una tabla de unión** (`servicios_sitios`). El conjunto se reemplaza entero y el antes y el después
  quedan en `auditoria`; el caso de uso exige que cada sitio esté vigente y sea del cliente del servicio, y no deja
  cambiar el cliente mientras haya sitios marcados.
- **"En uso".** `enUso` (el molde) pregunta además a `RepositorioServicios.usa`: un cliente, un tipo de servicio o un
  sitio que usa un servicio vigente no se da de baja (`DOM-0010`), sin que esas entidades declaren nada. El
  responsable no entra: revocar un usuario no borra nada.
- **Cómo cuelga lo que sigue.** Cotizaciones, órdenes de compra y facturas (F2-05 a F2-07) son tablas con
  `servicio_id`, cada una con su repositorio en `RepositoriosEnTransaccion`, y una sección más en
  `src/app/servicios/[id]/page.tsx`, alimentada por `ver` o por su propio caso de uso. Hoy no hay nada de eso: ni
  columnas, ni tipos, ni secciones vacías.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Servicio como un ABM más, con ganchos en `DefinicionAbm` | Cada gancho (código generado, estado, sitios, baja condicionada, detalle) lo usaría una sola entidad y lo pagarían todas |
| Copiar la validación, las relaciones y el listado del molde | Dos lugares que arreglar por cada cambio; se sacaron a funciones que usan los dos |
| El estado en una columna que se pisa, con una tabla de historial al lado | Dos verdades que pueden no coincidir; con eventos, el estado no se puede cambiar sin dejar rastro |
| El código con `count + 1` o `max + 1` | Dos altas a la vez leen lo mismo y repiten código |
| Una `SEQUENCE` de Postgres por prefijo y año | Hay que crearla por año con DDL, y un alta deshecha deja un hueco |
| Los sitios como una lista de ids en una columna | Sin clave foránea: un sitio dado de baja o de otro cliente quedaría adentro, y "en uso" no se podría consultar |

## Consecuencias

- El molde queda igual para los catálogos: ningún campo ni opción nueva en `DefinicionAbm`.
- Las entidades con detalle que vienen (F2-05 a F2-07) tienen de dónde copiar: puerto propio, piezas del molde.
- El filtro por estado se resuelve con una subconsulta sobre el último evento; con muchos servicios puede pedir un
  índice o una columna derivada. No se agrega hasta medirlo.
- Un cambio de estado concurrente que pierde ve `DOM-0011` y tiene que volver a abrir el servicio.
- Lo hacen cumplir `tests/dominio/servicios-estados.test.ts` (ejemplos y propiedades del ciclo),
  `tests/casos-uso/servicios.test.ts` (código, concurrencia, vigencia, sitios, baja, "en uso", roles, listado) y
  `tests/e2e/servicios.spec.ts`.

## Cómo se revierte

Se borran `src/app/servicios/`, `src/casos-uso/servicios/`, `src/dominio/servicios/`, el puerto y los dos
adaptadores (`servicios.ts`, `secuencias.ts`), sus dos líneas en `transaccion.ts` y la consulta a `usa` en `enUso`;
la migración `20261002160000_servicios` se revierte con su `down.sql`. Las funciones que se sacaron del molde pueden
quedar exportadas: no cambian lo que hace.
