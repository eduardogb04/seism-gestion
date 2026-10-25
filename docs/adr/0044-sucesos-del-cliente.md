# ADR 0044 — El suceso cuelga del cliente

**Fecha:** 2026-10-25
**Estado:** Propuesto
**Tarea:** F4-05
**Decide:** el plan (F4-05) y el orquestador (R1 a R10 de la ficha); el número lo fijó la ficha (0043 es de F4-01)

## Contexto

Desde F3-01 un suceso —lo que pasó, con su día y su texto— cuelga solo de un servicio. DISENO pide que la situación cuelgue
de un servicio **o del cliente suelto**: hay cosas que pasan con un cliente sin que haya un servicio (un cambio de contacto,
una reunión por una renovación) y la ficha del cliente tiene que mostrar toda su traza.

## Decisión

Los sucesos pasan a ser situaciones **del cliente**, con el servicio opcional. La tabla, el modelo y la pantalla del
servicio no se renombran (`servicios_sucesos`, `ServicioSuceso`, «sucesos»): el concepto cambia, no el nombre.

- **Columnas.** `servicios_sucesos.cliente_id` obligatoria, con clave foránea a `clientes` (`ON DELETE RESTRICT`) e índice;
  `servicio_id` pasa a ser opcional. La migración completa el cliente de los sucesos que ya existen desde su servicio, antes
  de exigirlo, así que ninguno se pierde. Su `down.sql` borra las sueltas, que el esquema anterior no puede guardar.
- **Carga.** Es el mismo caso de uso (`sucesos.crear`), que recibe `{ clienteId, servicioId }`: el cliente es obligatorio y
  tiene que existir (`DOM-0009`); con servicio, tiene que ser el del servicio (`DOM-0026`) y se aplican la fila tomada y la
  etapa de siempre (`DOM-0018`); sin servicio no hay etapa. Anular sigue siendo del servicio: una suelta no se anula por
  ahí (`DOM-0009`).
- **La traza.** La ficha del cliente (`/catalogo/clientes/<id>`, a la que lleva cada fila del listado) muestra las situaciones
  propias (sin servicio) y las de todos sus servicios, por fecha y, en la misma fecha, por creación, ambas descendentes. Una
  consulta del repositorio (`delCliente`) busca las de los servicios por **el cliente que el servicio tiene hoy**, no por la
  columna del suceso: un servicio «Creado» puede cambiar de cliente y sus sucesos lo acompañan sin tocar nada.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Una tabla nueva de situaciones del cliente, aparte de los sucesos | Dos listas para armar una traza y dos pantallas de carga: el suceso ya tiene todo lo que hace falta |
| Renombrar tabla, modelo y pantalla a «situaciones» | Churn sin valor: la persona sigue leyendo «sucesos» |
| Actualizar `cliente_id` de los sucesos cuando el servicio cambia de cliente | Es más código en el servicio para mantener un dato que la consulta ya deduce |

## Consecuencias

- Una pantalla más (la ficha) y una consulta más en el repositorio de sucesos; la columna lateral del servicio no cambia.
- `servicios_sucesos.cliente_id` de un suceso de servicio puede quedar atrás si el servicio cambia de cliente: nada lo lee.
- Un cliente con situaciones sueltas vigentes está en uso y no se da de baja (`DOM-0010`, `enUso`), como con sitios o camiones; las de un servicio las cubre el servicio.
- Lo hacen cumplir `tests/casos-uso/migracion-sucesos-del-cliente.test.ts`, `tests/casos-uso/sucesos.test.ts` y
  `tests/e2e/situaciones.spec.ts`.

## Cómo se revierte

`down.sql` de la migración (borra las situaciones sueltas) y volver la firma de `sucesos.crear` a un `servicioId`; la ficha
del cliente se borra sola con su carpeta.
