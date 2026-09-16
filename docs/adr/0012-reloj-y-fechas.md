# ADR 0012 — El dominio tiene su propio tipo de fecha y recibe el reloj inyectado

> Archivo: `docs/adr/0012-reloj-y-fechas.md`. Numeración correlativa, nunca se reutiliza. Un ADR
> aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*.

**Fecha:** 2026-09-15
**Estado:** Aprobado
**Tarea:** F0-18
**Decide:** el plan (P3, y la tarea F0-18 entera) sobre la regla de DISEÑO sección 7 *"el reloj se
inyecta: cero llamadas a la fecha del sistema en el dominio"*

## Contexto

DISEÑO pide que ninguna regla del dominio llame a la fecha del sistema, y que lo haga cumplir una
regla de lint. Eso no alcanza para escribir código: hay que decidir **qué tipo** de fecha usa el
dominio (si `Date` queda prohibido, algo tiene que ocupar su lugar), **qué operaciones** trae, qué
pasa con las **zonas horarias**, y **cómo** se hace cumplir la prohibición de forma que un fixture
pueda probar que sigue viva.

El dominio, además, no puede importar nada: dependency-cruiser (`dominio-puro`) le prohíbe hasta
`node:*`. Cualquier biblioteca de fechas queda descartada de entrada, y `Temporal` —aunque sea
global y no un import— sería la misma dependencia de plataforma que se quiere evitar.

## Decisión

**1. `FechaHora`, un tipo del dominio.** `src/dominio/compartido/reloj.ts` define `FechaHora` como
las siete partes de una fecha y hora civiles (`anio`, `mes`, `dia`, `hora`, `minuto`, `segundo`,
`milisegundo`), con una marca de tipo (`unique symbol`, se borra al compilar) para que solo
`crearFechaHora` y `parsearISO` puedan producir una. Las dos validan y devuelven
`{ ok: true, fechaHora } | { ok: false, mensaje }`, como el resto del repo.

**2. Fecha civil, sin zona horaria.** Una `FechaHora` es *"el 15 de septiembre de 2026 a las
14:30"*, no un instante: no lleva desplazamiento ni referencia a UTC. Todo el dominio trabaja en
fecha civil argentina. Convertir desde y hacia `Date` o `Temporal`, y aplicar la zona, es trabajo
de los adaptadores, **fuera** del dominio. El texto de intercambio es
`AAAA-MM-DDTHH:MM:SS.mmm`, sin `Z` ni desplazamiento, y `parsearISO` **rechaza** los ISO que los
traen: si aparece una zona, la decisión es del borde y tiene que tomarla ahí.

**3. Aritmética entera, escrita a mano.** `diasDesdeCivil` / `civilDesdeDias` (algoritmo de Howard
Hinnant) convierten fecha civil a un número de días y vuelven, con enteros. De ahí salen
`sumarDias` (conserva la hora del día) y `diferenciaEnDias`. Tres reglas explícitas:

- `sumarMeses` **recorta** al último día del mes destino: 31/01 + 1 mes es 28/02, o 29/02 si el año
  es bisiesto.
- `sumarAnios(n)` es `sumarMeses(n × 12)`: el mes **nunca** cambia, y el único día que se mueve es
  el 29 de febrero, que cae en el 28 cuando el año destino no es bisiesto.
- `diferenciaEnDias` **ignora la hora del día** y cuenta días civiles: del 15 a las 23:59 al 16 a
  las 00:01 hay un día. Es lo que la hace entera y antisimétrica. Para comparar instantes está
  `esAnterior`, que sí mira la hora.

**4. El reloj se inyecta.** `Reloj { ahora(): FechaHora }` es la única forma de preguntar la hora
dentro del dominio. `RelojFijo(fecha)` es la implementación de los tests: devuelve siempre la misma
fecha, y es lo que hace testeable cualquier regla con vencimientos sin esperar ni simular el paso
del tiempo.

**5. La prohibición es de lint, acotada por ruta.** `biome.json` tiene un `override` sobre
`**/src/dominio/**` con `style/noRestrictedGlobals` en `error` para la global `Date`, con un
mensaje que dice qué usar en su lugar. Fuera del dominio la regla no existe. La marca aparece en el
editor, no solo en CI, que es lo que pedía DISEÑO al elegir lint y no un test que hace *grep*.

**6. El fixture extiende la configuración de la raíz.**
`tests/fixtures/lint/reloj-inyectado/` replica la estructura `src/...` que la regla por ruta
necesita, y su `biome.json` **extiende** el de la raíz en vez de repetir la regla. Así prueba la
regla de verdad: si alguien la saca de `biome.json`, el fixture pasa el lint y
`npm run lint:fixtures` se pone en rojo. La carpeta trae además el caso permitido
(`src/adaptadores/reloj/usa-date.ts`, el mismo código fuera del dominio), que detecta si la regla
se pasa de alcance. Corre dentro del check `ci`, en el paso `lint:fixtures` que ya existía.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Usar `Date` en el dominio y disciplinarse con la revisión | Es exactamente lo que DISEÑO prohíbe: la fecha del sistema hace que los vencimientos no se puedan testear sin trucos |
| Usar `Temporal` (`Temporal.PlainDateTime`) | Es una global de la plataforma: la misma dependencia que se quiere sacar del dominio, y con una superficie enorme que habría que acotar igual. Entra en los adaptadores el día que convenga, sin que el dominio se entere |
| Una biblioteca de fechas (date-fns, Luxon, Day.js) | `dominio-puro` le prohíbe al dominio importar cualquier cosa, y la tabla de herramientas de DISEÑO no las trae |
| Guardar la fecha como milisegundos desde 1970 | Un número de época **es** un instante UTC: mete la zona horaria adentro del dominio por la puerta de atrás, justo lo que esta tarea deja afuera |
| Que cada `FechaHora` lleve su zona horaria | Fase 0 no lo necesita (toda la operación es argentina) y obliga a decidir en cada regla del dominio algo que se decide una vez, en el borde |
| Que `diferenciaEnDias` cuente la hora y trunque | Truncar rompe la antisimetría: `a − b` dejaría de ser `−(b − a)` cuando hay horas de por medio |
| Que `sumarMeses` desborde al mes siguiente (31/01 + 1 mes = 03/03) | Ninguna persona lee así un vencimiento mensual. Recortar al último día del mes es lo que espera quien firma el contrato |
| `noRestrictedGlobals` sobre todo `src/` | Los adaptadores **tienen** que usar `Date`: son los que traducen. Una regla global obligaría a un `biome-ignore` en cada uno |
| Un test que hace *grep* buscando `Date` en el dominio | Funciona, pero no aparece en el editor: el error llega recién en CI. DISEÑO pide lint (P3) |
| Repetir la regla en el `biome.json` del fixture, como hace `debe-fallar.ts` (F0-02) | El fixture probaría su propia copia. Sacar la regla de la raíz lo dejaría en verde: justo el caso que tiene que detectar |
| Escribir las propiedades con fast-check | fast-check llega en F0-15 y esta tarea no suma dependencias. El generador determinista de `tests/dominio/reloj.test.ts` cubre las mismas propiedades y se reescribe cuando esté |

## Consecuencias

- Se gana: cualquier regla con vencimientos se testea con `RelojFijo` y una fecha fija, sin
  esperar, sin simular temporizadores y sin que el resultado dependa del día en que corre CI.
- Se pierde: el dominio no puede usar nada de lo que `Date` o `Intl` traen gratis (día de la
  semana, semanas del año, formatos localizados, feriados). Lo que haga falta se agrega a
  `reloj.ts` con su test, no se importa.
- Zonas horarias: **no entran en Fase 0**. El día que el sistema tenga que hablar con alguien fuera
  de la Argentina, la conversión se agrega en los adaptadores y el dominio no cambia. Si alguna vez
  hace falta guardar el instante además de la fecha civil, es un tipo nuevo al lado de `FechaHora`,
  no un campo más adentro.
- `parsearISO` rechaza los ISO con zona: un adaptador que reciba `...Z` de una API externa tiene
  que decidir a qué fecha civil corresponde **antes** de entrar al dominio. Es a propósito.
- Quién lo hace cumplir: `npm run lint` (`style/noRestrictedGlobals` sobre `**/src/dominio/**`),
  probado por `npm run lint:fixtures` con el fixture `reloj-inyectado/` (el caso rechazado y el
  permitido); `npm run limites` (`dominio-puro`) para que no entre ninguna biblioteca de fechas; y
  `tests/dominio/reloj.test.ts` para el comportamiento, casos y propiedades.

## Cómo se revierte

Para aflojar la prohibición: se borra el bloque `overrides` de `biome.json` y la carpeta
`tests/fixtures/lint/reloj-inyectado/`, y se saca su entrada de `scripts/lint-fixtures.ts`. El
código del dominio no hay que tocarlo: afloja una restricción, no cambia ninguna API.

Para cambiar el tipo de fecha (por ejemplo, adoptar `Temporal` dentro del dominio) hay que tocar
`src/dominio/compartido/reloj.ts` y todo lo que lo use, que en el momento de escribir esto es solo
su test. Cuanto más tarde se haga, más caro: por eso se decide en la primera tarea del lote 5 y no
después.
