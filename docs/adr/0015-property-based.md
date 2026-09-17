# ADR 0015 — fast-check como motor de propiedades, con un meta-test permanente

> Archivo: `docs/adr/0015-property-based.md`. Numeración correlativa, nunca se reutiliza. Un ADR
> aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*.

**Fecha:** 2026-09-16
**Estado:** Aprobado
**Tarea:** F0-15
**Decide:** el plan (tabla de herramientas, DISEÑO sección 7: *"Propiedades: fast-check"*) y el
cimiento 4 (*"fast-check se prueba con una propiedad deliberadamente falsa que tiene que fallar,
para demostrar que el motor busca contraejemplos de verdad"*)

## Contexto

F0-18, F0-19 y F0-21 necesitaban propiedades (fechas, códigos legibles, historial de estados)
antes de que existiera esta tarea, y el plan no permite sumar dependencias fuera de la tabla de
herramientas dentro de una tarea que no es la que las instala. F0-18 y F0-19 resolvieron eso con
generadores propios, deterministas por semilla (`mulberry32` o similar, escrito a mano, sin
librería), dejando anotado en su ADR y en `AGENTS.md` que se reescriben con fast-check cuando esta
tarea llegue.

El criterio del cimiento 4 pide algo más que "instalar la librería": pide una demostración de que
el motor de verdad busca contraejemplos y no solo corre `numRuns` veces y dice que sí — y pide que
esa demostración quede **permanente**, no como un test que se corrió una vez y se borró.

## Decisión

**1. fast-check, versión exacta, como devDependency.** Un único motor de propiedades para todo el
dominio, en la tabla de herramientas.

**2. Un meta-test permanente que nunca puede quedar en verde por las razones equivocadas.**
`tests/dominio/_arnes/fast-check.test.ts` corre `fc.check` (no `fc.assert`, que cortaría lanzando
en el primer contraejemplo) sobre una propiedad deliberadamente falsa —*"para todo par de enteros,
`a + b` es mayor que `a`"*, falsa apenas `b <= 0`— y afirma `resultado.failed === true` y
`resultado.counterexample !== null`. No se arregla la propiedad (sería el error contrario: taparía
la demostración): la propiedad **tiene que seguir siendo falsa**, para siempre, con el meta-test
afirmando que fast-check la encuentra rota. Si alguien reemplazara fast-check por un doble que
siempre dice que sí, o rompiera la exploración, este test se pone en rojo.

**3. Un helper compartido, `propiedad()`, en `tests/dominio/_arnes/propiedad.ts`.** Fija:

- `numRuns`: 1000 en CI, 200 en local. CI se detecta con la variable de entorno `CI`, igual que en
  el resto del repo — no hay una segunda forma de saber si se está en CI.
- **La semilla, fijable por `FC_SEED` y anunciada una vez por tanda.** Sin `FC_SEED`, se sortea una
  (`Date.now()`); con `FC_SEED=<número>`, se usa esa. En los dos casos, antes de correr el primer
  test se imprime `[fast-check] semilla=... numRuns=... — para reproducir esta tanda:
  FC_SEED=<semilla> npm run test:dominio` — **siempre**, pase o falle la tanda. Quien vio una
  corrida verde y quiere insistir sobre esa misma exploración (o alguien más, en otra máquina)
  corre ese mismo comando y obtiene exactamente la misma serie de entradas en todas las
  propiedades del dominio.

  Lo resuelve `tests/dominio/_arnes/semilla.ts`, un `globalSetup` del proyecto `dominio` (corre una
  sola vez en el proceso principal, antes de que arranque cualquier archivo de test — al revés de
  un `console.log` puesto en el helper, que se repetiría una vez por archivo, porque Vitest aísla
  cada archivo). Le pasa la semilla resuelta a los tests con `provide`/`inject`, el mismo mecanismo
  que ya usa `tests/casos-uso/_arnes/contenedor.ts` para los datos del contenedor — no una variable
  de entorno leída dos veces, que no garantiza ver el mismo valor si el archivo de test corriera en
  otro proceso.

`propiedad(...arbitrarias, predicado)` tiene la misma firma que `fc.property` y hace
`fc.assert(fc.property(...), configuracion())`; `configuracion()` queda exportada por si algo
necesita llamar a `fc.assert`/`fc.check` directo (como el meta-test del punto 2).

**4. Las propiedades de F0-18 y F0-19 se reescriben en esta tarea, sin cambiar lo que afirman.**
`tests/dominio/reloj.test.ts` e `tests/dominio/identificador.test.ts` cambian su generador propio
por `propiedad()` y arbitrarias de fast-check equivalentes (mismo rango de fechas, mismos casos de
29 de febrero, mismo alfabeto de prefijos, mismo tamaño de mutación); se borra el generador
`mulberry32` de los dos archivos, que queda sin uso. `tests/dominio/historial.test.ts` (F0-21) no
usa un generador propio — sus "propiedades" recorren **todas** las secuencias de transiciones
declaradas hasta cierto largo (`caminosValidos`, enumeración exhaustiva, no azar) — así que no
aplica y queda como está.

**Efecto colateral encontrado, no buscado.** Migrar la propiedad de mutación de un carácter de
`identificador.test.ts` a fast-check hizo que fast-check encontrara, en la primera corrida con
`CI=1` (1000 corridas), un contraejemplo real que el generador `mulberry32` con semilla fija nunca
había tocado en sus 200 corridas: mutar el primer dígito de un año a `"0"` (p. ej. `SRV-1000-001`
→ `SRV-0000-001`) hacía que `parsearCodigo` devolviera `{ prefijo, anio: 0, secuencia }` en vez de
`null`, porque solo validaba "4 dígitos" y no el rango 1000–9999 que sí exige `formatearCodigo` —
rompiendo el contrato ya documentado en el código ("`parsearCodigo` acepta exactamente lo que
`formatearCodigo` produce"). Es exactamente el tipo de caso que el cimiento 4 dice que un motor de
propiedades tiene que encontrar y el generador casero no encontró. Se corrigió con un chequeo de
rango en `parsearCodigo` (`src/dominio/compartido/identificador.ts`), un cambio de una línea, y se
sumaron dos casos puntuales (`SRV-0000-014`, `SRV-0999-014`) a los rechazos explícitos del mismo
archivo de test.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Semilla constante, siempre la misma, en la configuración compartida | Congelaría para siempre la misma serie de entradas: cada corrida futura exploraría exactamente los mismos casos, que es lo opuesto de lo que un motor de propiedades aporta sobre un generador casero. El criterio pide las dos cosas —una semilla fijable **y** que se pueda reproducir cualquier corrida—, no una constante: `FC_SEED` cubre la primera sin perder la segunda |
| Confiar solo en que `fc.assert` imprime el `seed` al fallar | Alcanza para reproducir una propiedad que ya rompió, pero no para "correr de nuevo esta misma tanda" cuando todo pasó (por ejemplo, para buscar más agresivo alrededor de una corrida sospechosa, o para que alguien más la reproduzca bit a bit). El criterio pide que la semilla quede registrada **siempre**, no solo en el camino de error |
| Anunciar la semilla con un `console.log` dentro de `propiedad()` o `configuracion()` | Esas funciones las llama cada archivo de test, y Vitest aísla cada archivo (módulos frescos): se imprimiría una vez por archivo, no una vez "al empezar la tanda". Un `globalSetup` del proyecto corre una sola vez, antes que cualquier archivo |
| Pasar la semilla resuelta por variable de entorno en vez de `provide`/`inject` | Mutar `process.env` desde el `globalSetup` para que los archivos de test la lean depende de que Vitest siga corriéndolos en el mismo proceso (o herede el entorno al crear cada worker); `provide`/`inject` es la forma documentada y ya usada en este repo (`tests/casos-uso/_arnes/contenedor.ts`) para pasar datos del `globalSetup` a los tests sin ese supuesto |
| Demostrar la propiedad falsa una sola vez y borrar el test | El cimiento 4 pide la demostración **permanente**: si algo rompe la exploración de fast-check más adelante (una actualización, una mala configuración), tiene que notarse en CI, no solo en la memoria de quien escribió esta tarea |
| Usar `fc.assert` en el meta-test | `fc.assert` lanza en el primer contraejemplo: no deja inspeccionar `failed`/`counterexample` con un `expect` normal. `fc.check` devuelve el `RunDetails` completo sin lanzar |
| Dejar el contraejemplo de `parsearCodigo` como "no es parte de esta tarea" | Es un bug real y ya documentado por su propio contrato en el código; dejarlo en rojo no es una opción (la propiedad tiene que valer), y silenciar la propiedad (acotando el rango de mutación) escondería justo el tipo de caso que esta tarea existe para encontrar |
| Reescribir también `tests/dominio/historial.test.ts` | No usa un generador propio: sus "propiedades" son una enumeración exhaustiva de secuencias declaradas, no una muestra al azar. No hay generador que reemplazar |

## Consecuencias

- Se gana: un motor de propiedades de verdad (shrinking a un contraejemplo mínimo, cobertura mucho
  más amplia que 200-500 corridas con un PRNG casero) para todo lo que el dominio necesite desde el
  lote 5 en adelante, con una configuración que no hay que repetir por archivo.
- Se pierde: los generadores `mulberry32` de F0-18 y F0-19 (documentados en sus ADR como
  provisorios) — quedan sin uso y se borran de los dos archivos de test.
- La demostración de que el motor funciona vive en CI para siempre, no en un commit que se revierte.
- Quién lo hace cumplir: `tests/dominio/_arnes/fast-check.test.ts` (el meta-test), corrido dentro
  de `npm test` / `npm run test:dominio` como cualquier otro test del nivel dominio.
- `tests/dominio/_arnes/semilla.ts` (`globalSetup` del proyecto `dominio`) corre en cualquier forma
  de invocar esos tests (`npm test`, `npm run test:dominio`, o `vitest run --project dominio` a
  mano): la variable `FC_SEED` y el anuncio en pantalla valen siempre, no solo detrás del script
  `scripts/test-dominio.ts`.

## Cómo se revierte

Volver al generador propio significaría deshacer este ADR entero: quitar `fast-check` de
`package.json`, borrar `tests/dominio/_arnes/propiedad.ts` y `fast-check.test.ts`, y reescribir las
propiedades de `reloj.test.ts` e `identificador.test.ts` con un PRNG a mano otra vez. El fix de
`parsearCodigo` es independiente y no se revierte con esto: es un bug de F0-19, encontrado acá.
