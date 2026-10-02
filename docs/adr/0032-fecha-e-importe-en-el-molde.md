# ADR 0032 — Fecha e importe en el molde de ABM

**Fecha:** 2026-10-01
**Estado:** Aprobado
**Tarea:** F2-03
**Decide:** el plan (F2-03) y Eduardo (R1 a R16 de la ficha); ADR 0018 (importes) y ADR 0031 (molde)

## Contexto

Egresos es el primer registro con una fecha y un importe. El molde de ABM (ADR 0031) solo conocía texto,
casilla, número, opción y relación: todos caben en una columna y en un `string | number | boolean | null`. Un
importe son centavos `bigint` **y** una moneda; no cabe en una columna ni viaja por JSON, y una fecha sin hora no
se puede dejar a merced de la zona horaria.

## Decisión

El molde suma dos tipos de campo, y con ellos lo que Egresos necesita para listarse.

- **`fecha`**: un día. El dato es el texto `aaaa-mm-dd`; la columna, `DateTime @db.Date` (Postgres `date`); el
  control, `<input type="date">`; se muestra `dd/mm/aaaa`. Que el día exista lo decide `esDiaValido`
  (`src/dominio/compartido/reloj.ts`, sobre `crearFechaHora`: no hay otro calendario). **Ninguna zona horaria en
  ningún paso**: Prisma entrega un `date` como `Date` a medianoche UTC y el adaptador lo lee y lo escribe siempre en
  UTC, así que el día de la base es el día que se ve, en cualquier máquina. Un instante (`FechaHora`, `timestamptz`)
  sigue siendo otra cosa: la hora argentina de la auditoría.
- **`importe`**: el dato es un `Importe<Moneda>` (centavos `bigint` y moneda). En la base son **dos columnas**,
  `<campo>_centavos` (`BigInt`) y `<campo>_moneda` (texto). En el formulario, el monto con el nombre del campo y la
  moneda con `nombreDeMoneda(campo)`, bajo una sola etiqueta y un solo mensaje. Se lee con `parsearImporte` (ADR 0018)
  y se escribe con `formatearMonto`; ningún paso pasa por `number`.
- **Dónde se convierte el `bigint`.** Dentro del proceso es `bigint`, sin conversión. Fuera: al formulario sale como
  texto formateado (`escritoDe`), y a JSON (la auditoría) sale como texto de dígitos, en **un solo lugar**:
  `aJsonAnidado` (`src/adaptadores/prisma/conversiones.ts`). Los centavos que la auditoría guarda no pierden un dígito;
  nada de esto viaja a un componente de cliente (los datos no cruzan: el formulario recibe texto).
- **Una entidad cuyos datos no son los de su fila** (una fecha es `Date` y un importe son dos columnas) pasa además su
  `Conversion` (`src/adaptadores/prisma/abm/repositorio.ts`): cómo va de la fila a los datos y de vuelta, y cómo se
  traduce una columna de los datos a la de la fila (buscar, filtrar, ordenar por importe es ordenar por centavos). Las
  demás entidades no la pasan y no cambian; la de Egresos está en `abm/egresos.ts`.
- **Filtros del listado.** La definición declara `filtros`: columnas de `relacion` (por ese registro) o de `fecha` (por
  mes, entre los meses que tienen registros: `mesesCon`). Son selectores dentro del mismo formulario `GET` de la
  búsqueda; se resuelven en la base y se conservan, con la búsqueda, el orden y la página, al paginar y al abrir y
  cerrar una ventana. Un valor de la URL que no sirve se ignora.
- **`soloSi` en `relacion`**: el selector ofrece solo los registros vigentes con esa casilla marcada (`activo`,
  `esProveedor`) y el servidor rechaza uno que no la cumpla. Al editar, lo que el registro ya tenía elegido sigue
  ofreciéndose y se puede guardar sin cambiarlo.
- **`direccionInicial`**: el sentido del orden cuando la URL no trae uno (Egresos, lo más nuevo primero).
- **El formato de un importe pasa al dominio.** `formatearMonto` y `formatearImporte` vivían en `src/app/formato/`; el
  listado y el formulario del molde son casos de uso y no pueden importar de `src/app`. Siguen siendo aritmética
  entera, sin `Intl`; la ida y vuelta con `parsearImporte` sigue probada en `tests/dominio/importe.test.ts`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| La moneda como un campo `opcion` aparte | El importe deja de ser una unidad: se podría guardar un monto sin moneda o al revés, y cada entidad con plata repetiría el par |
| El monto como `number` o `parseFloat` | Pierde centavos en montos grandes; ADR 0018 lo prohíbe |
| Un solo campo de texto `importe` que lleva el código de moneda (`USD 1.234,50`) | La base no puede ordenar por monto, y se reabre la lectura "sin adivinar" de ADR 0018 |
| La fecha como `timestamptz` a medianoche local, o como texto | Corre un día según la zona de quien la escribe, o no se ordena ni se filtra por mes en la base |
| Filtrar y listar los meses en memoria | Trae todo el listado para mostrar una página; el filtro y el orden los resuelve la base |
| Un puerto y un adaptador propios de Egresos | El molde ya hace lo mismo para otras seis entidades; lo nuevo es una `Conversion` de unas 60 líneas |

## Consecuencias

- Un ABM con fechas o importes cuesta además su `Conversion` (y el modelo con sus dos columnas, si es un importe).
- `ValoresAbm` incluye `Importe<Moneda>`: lo que recorre campos por nombre tiene que tratar a un importe por valor
  (`mismoValor`, en `abm.ts`, compara centavos y moneda: dos objetos distintos con el mismo importe no son un cambio).
- El `historial` del molde lee de la auditoría solo valores simples: un importe todavía no se puede declarar ahí.
- Las monedas siguen en un solo lugar, `MONEDAS` (`importe.ts`); el control del formulario las toma de ahí por
  `casos-uso/abm/definicion.ts`, porque `app` solo importa tipos del dominio.
- Lo cuidan `tests/casos-uso/abm-egresos.test.ts` (propiedad de ida y vuelta de centavos contra Postgres, montos y fechas
  inválidos, orden, filtros, `soloSi`, auditoría) y `tests/e2e/egresos.spec.ts`.

## Cómo se revierte

Sacar Egresos es quitar `Egreso` de `EntidadesAbm`, `tablas.ts` y `definiciones.ts`, la migración `egresos` (su
`down.sql`) y `src/app/egresos/`. Sacar los tipos `fecha` e `importe`, los `filtros`, `soloSi` y `direccionInicial` del
molde es quitar esas variantes de `CampoAbm` y de `DefinicionAbm`, `Conversion` y `crearRepositorioConConversion`: ningún
otro ABM los usa.
