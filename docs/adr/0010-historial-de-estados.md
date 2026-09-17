# ADR 0010 — El historial de estados recibe de afuera la fecha, la aritmética y sus tipos

**Fecha:** 2026-09-15
**Estado:** Aprobado
**Tarea:** F0-21
**Decide:** el plan (F0-21, y la regla de pureza del dominio de DISENO sección 7)

## Contexto

`src/dominio/compartido/historial.ts` (F0-21) necesita tres piezas que son de otras tareas del
mismo lote 5, todavía sin fusionar:

- `FechaHora` y su `diferenciaEnDias`, que trae el reloj inyectable de **F0-18**;
- `Actor` y `Origen`, que traen los tipos de trazabilidad de **F0-22**;
- un error con código estable, que trae el catálogo de **F0-23** (lote 6).

El dominio es puro y no puede usar `Date`, así que el historial no puede calcular días por su
cuenta; y duplicar `FechaHora` acá dejaría dos definiciones de la misma cosa en el mismo lote.

## Decisión

**El historial no importa nada: la fecha, la aritmética de fechas y los tipos de trazabilidad
entran por parámetro.**

- La marca de tiempo de cada evento llega como dato (`Marca.en`): quien escribe la toma del reloj
  en el borde. Dentro del historial no se consulta la fecha del sistema.
- La aritmética llega como función: `definirCiclo({ transiciones, diferenciaEnDias })`. Cuando
  F0-18 fusione, se le pasa su `diferenciaEnDias` y no cambia nada más.
- Los tipos de `en`, `actor` y `origen` son parámetros de tipo con valor por defecto `string`:
  `Historial<E>` se lee como lo pide el plan, y `Historial<Estado, FechaHora, Actor, Origen>`
  queda disponible sin tocar el módulo cuando F0-18 y F0-22 aterricen.
- El único modo de fallar es `CODIGO_TRANSICION_INVALIDA`, una constante con su código estable
  (`DOMINIO.HISTORIAL.TRANSICION_INVALIDA`). F0-23 la pasa al catálogo conservando el código.
- `agregar` devuelve `Resultado<Historial, TransicionInvalida>`: una regla de negocio que no se
  cumple no se lanza como excepción.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Esperar a que F0-18 y F0-22 fusionen | Serializa medio lote 5 por una dependencia de tipos, no de comportamiento |
| Definir `FechaHora` acá | Dos definiciones de la misma cosa en el mismo lote, y un conflicto seguro con F0-18 |
| Que el historial calcule los días desde una fecha ISO | Es duplicar F0-18 (calendario civil) dentro de otro módulo del dominio |
| Que `agregar` lance una excepción | El dominio no lanza por reglas de negocio: el error es un valor con código |

## Consecuencias

- Se gana: el historial es puro, testeable sin reloj, y no bloquea ni se bloquea con F0-18/F0-22.
- Se gana: el mismo módulo sirve para cualquier alfabeto de estados; Fase 1 declara los ciclos de
  `Servicio` y `Ejecución` sin tocarlo.
- Se pierde: quien lo usa tiene que declarar el ciclo una vez (`definirCiclo`) en vez de llamar
  funciones sueltas, y cargar la aritmética de fechas ahí.
- Queda pendiente, y es trabajo de esas tareas, no de esta: F0-18 pasa `FechaHora` y su
  `diferenciaEnDias`; F0-22 pasa `Actor` y `Origen`; F0-23 mueve el código de error al catálogo.
- Lo hace cumplir dependency-cruiser (`dominio-puro`: el módulo no importa nada) y la regla de
  lint de F0-18 sobre `Date` en `src/dominio/**`.

## Cómo se revierte

Se cambian los parámetros de tipo por los tipos concretos y se pasa a importar `reloj.ts`. Es un
cambio dentro de `historial.ts` y de sus llamadores; el comportamiento no se toca.
