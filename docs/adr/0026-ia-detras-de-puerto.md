# ADR 0026 — La IA detrás de un puerto: validación, registro y tope en el caso de uso

> Archivo: `docs/adr/0026-ia-detras-de-puerto.md`. El plan sugería 0010; 0021 a 0025 están
> tomados o reservados por otras tareas del mismo lote.

**Fecha:** 2026-09-28
**Estado:** Propuesto
**Tarea:** F0-28
**Decide:** el plan (F0-28) y las resoluciones del orquestador de la tarea

## Contexto

La IA va a proponer datos (Fase 1) y no puede escribir en el dominio (regla no negociable 8). Hacen
falta tres garantías que no dependan de la buena voluntad de cada adaptador: que ninguna salida se
use sin validar, que toda salida quede registrada y que el gasto del mes tenga tope. En Fase 0 no
hay ni una llamada real: solo un doble.

## Decisión

**Nadie le habla a un proveedor de IA fuera de `src/puertos/ia.ts`, y al puerto solo le habla el
caso de uso `interpretar` (`src/casos-uso/ia/interpretar.ts`).** El adaptador devuelve la salida
**cruda** (`ValorJson`) con `modelo`, `versionPrompt`, `costoMicroUsd` y `tokens`; las tres
garantías viven en el caso de uso, en este orden:

1. **Tope.** Mes = mes civil del `Reloj` inyectado (`FechaHora`, sin `Date`). Acumulado = suma de
   `uso_ia.costo_usd` con `en` en `[primer día del mes, primer día del mes siguiente)`. Estimado =
   `configuracion` `ia.costo_estimado_usd.<perfil>` o, si falta, `ia.costo_estimado_usd.defecto`
   (el doble no puede estimar; el adaptador real de Fase 1 lo reemplaza por el costo reportado).
   Si `acumulado + estimado > ia.tope_mensual_usd` —**estrictamente**: igual al tope se permite—
   no se llama al adaptador, se avisa por `AvisosIa` y se **lanza** `IA-0001` con `{ acumulado,
   estimado, tope, mes, perfil }`. No se escribe fila: no hubo llamada.
2. **Registro.** La fila de `uso_ia` (la salida tal cual y `propuesta_valida`) se escribe **antes**
   de devolver o de lanzar `IA-0002`. Si no se puede escribir, `INF-0001` con la causa y la
   propuesta no sale.
3. **Validación.** `esquemaSalida.safeParse` con el esquema Zod de quien llama. Si no valida,
   `IA-0002` con los problemas de Zod (`ruta`, `mensaje`) en `detalles`.

**`IA-0001` se lanza como `ErrorSistema`, no se devuelve como `Resultado`.** El que llamó lo
distingue por código (`error instanceof ErrorSistema && error.codigo === "IA-0001"`) y sigue "por
reglas" (hay un llamador de ejemplo en `tests/casos-uso/ia-tope.test.ts`). `interpretar` es un
borde (ADR 0020: en un borde se lanza `nuevoError`), y así un llamador que se olvida de mirar el
tope no puede seguir con una propuesta que no existe.

**Costos en micro-dólares enteros.** El `Importe` de F0-20 (centavos) no alcanza para el costo de
unos tokens. En el código, `MicroUsd = bigint` (`src/dominio/compartido/micro-usd.ts`); en la base,
`costo_usd Decimal(14,6)`; en `configuracion`, texto con punto decimal (`"10.00"`, `"0.015"`)
leído con `parsearUsd` (hasta seis decimales, sin negativos, sin redondear). Nunca `number`.

**`en` es un instante (`timestamptz`) y la conversión es del adaptador de Prisma**
(`src/adaptadores/prisma/fecha-hora.ts`): la `FechaHora` civil argentina es UTC−03:00 (sin
horario de verano desde 2009).

**El aviso del tope va por el log** (`src/adaptadores/log/avisos-ia.ts`, `warn` con `codigo:
"IA-0001"`, sin la entrada) hasta que el puerto de notificaciones (F0-29) esté en `main`: entonces
se implementa `AvisosIa` con ese puerto y el caso de uso no cambia.

**El doble** (`src/adaptadores/ia-doble/`) recibe la tabla de casos al construirse y responde por
perfil y entrada exactos; lo que no está en la tabla es `INF-0001`, nunca una respuesta inventada.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Que el adaptador valide con el esquema | Cada adaptador nuevo tendría que acordarse; uno que no lo haga devolvería salidas sin validar. En el caso de uso, no se puede saltear |
| Devolver `IA-0001` como `Resultado` de fallo | Obliga a todos los tipos de retorno a cargar el fallo aunque casi nadie lo trate distinto de un error; y un llamador que no mire `ok` seguiría sin propuesta como si nada. El código estable ya lo hace distinguible |
| Sumar costos con `number` | Los decimales binarios no suman exacto; el tope se decide en el borde de un micro-dólar |
| Costos en centavos (`Importe`) | Una llamada cuesta fracciones de centavo: todo redondearía a cero |
| Escribir la fila después de devolver (o en segundo plano) | Una propuesta podría usarse sin haber quedado registrada, justo lo que la spec prohíbe |
| No escribir fila cuando la salida es inválida | Se pagó la llamada y se pierde la evidencia de qué respondió el proveedor |
| `timestamp` sin zona para `en` | `docs/convenciones-base.md` pide `timestamptz(3)` para los tiempos |

## Consecuencias

- Una sola puerta: cambiar de proveedor es escribir otro `AdaptadorIa`, sin tocar validación,
  registro ni tope.
- El tope no es atómico: dos llamadas simultáneas pueden pasar las dos con el mismo acumulado y
  superarlo por el costo de una. Se acepta en Fase 0 (sin llamadas reales ni concurrencia); si
  hiciera falta, se decide en la tarea del adaptador real.
- `npm run db:seed` deja cada clave de `configuracion` en su valor de `prisma/seed.ts`: el tope se
  cambia ahí, por PR (RUNBOOK).
- Lo hacen cumplir: `tests/casos-uso/ia-interpretar.test.ts` (validación, fila antes de devolver,
  fila que no se puede escribir), `tests/casos-uso/ia-tope.test.ts` (borde exacto, +1 micro-dólar,
  cero llamadas, cambio de mes, llamador "por reglas", `gastoDelMes`),
  `tests/dominio/ia-doble.test.ts` y `tests/dominio/micro-usd.test.ts`. Que nadie más le hable a un
  proveedor lo cuida la revisión (AGENTS.md) y dependency-cruiser (los casos de uso no pueden
  importar adaptadores).

## Cómo se revierte

Todo queda en `src/casos-uso/ia/`, `src/puertos/ia.ts`, `src/puertos/repositorios/`, los
adaptadores `ia-doble`, `log/avisos-ia.ts` y `prisma/{uso-ia,configuracion,fecha-hora}.ts`, y la
migración `uso_ia` (con su `down.sql`). Cambiar una garantía (por ejemplo, `IA-0001` como
`Resultado`) toca solo `interpretar.ts` y sus llamadores.
