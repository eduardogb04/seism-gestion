# ADR 0018 — Importes en centavos `bigint`, tipo de cambio como fracción exacta y un solo redondeo

> Archivo: `docs/adr/0018-importes.md`. Numeración correlativa, nunca se reutiliza. Un ADR
> aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*.

**Fecha:** 2026-09-25
**Estado:** Propuesto
**Tarea:** F0-20
**Decide:** DISEÑO (sección 2, decisión 1: *"cada importe lleva monto + moneda; cuando hay
conversión, un campo de tipo de cambio cargado a mano, con fecha y fuente"*) y el plan (P5:
redondeo half-up al centavo)

## Contexto

Todo el sistema va a mover importes en dos monedas (ARS y USD) y convertir entre ellas con un tipo
de cambio que se carga a mano. Hacía falta decidir cómo se representa un monto para no perder ni
inventar centavos, cómo se impide mezclar monedas, dónde y cómo se redondea, y cómo se lee el
texto que escribe el usuario sin ambigüedad entre el formato argentino y el inglés.

## Decisión

Un importe es `Importe<M extends Moneda>` con `centavos: bigint` y la moneda como tipo literal, y
la única operación que redondea es `convertir`, a través de una sola función half-up.

- **Monedas.** `MONEDAS = ["ARS", "USD"] as const` en `src/dominio/compartido/importe.ts`; `Moneda`
  se deriva de ahí. Sumar una moneda es tocar esa constante (AGENTS.md, *Cómo se agrega... una
  moneda*).
- **Tipos.** `sumar` y `restar` exigen la misma moneda literal en los dos operandos: `sumar(ARS,
  USD)` no compila, y tampoco `sumar` de dos `Importe<Moneda>` (moneda no resuelta), porque en
  ejecución podrían ser distintas. Lo prueban `// @ts-expect-error` en
  `tests/dominio/importe.test.ts`, que `npm run typecheck` compila (`tests/**/*.ts` está en el
  `include` de `tsconfig.json`).
- **Aritmética entera.** `multiplicar` solo por `bigint`. `repartir(importe, n)` exige `n` entero
  ≥ 1 (si no, devuelve el error `DOMINIO.IMPORTE.PARTES_INVALIDAS`, no lanza); los centavos del
  resto van de a uno a las primeras partes, con el signo del total. Propiedad: la suma de las
  partes es el total y ninguna difiere de otra en más de un centavo, para totales positivos, cero
  y negativos.
- **Tipo de cambio.** `TipoDeCambio { de, a, valor, fecha, fuente, cargadoPor }`. `valor` es una
  fracción exacta de `bigint` (`numerador / denominador`): se carga desde texto decimal con
  `parsearValorTipoDeCambio("1.184,25")` → `118425/100` (misma regla que los montos, pero sin signo y con cualquier cantidad de decimales), y su inverso (`100/118425`) sigue siendo
  exacto. Cero, negativo o texto inválido → `DOMINIO.TIPO_DE_CAMBIO.INVALIDO` en `valor`. `fecha`
  es `FechaHora` (ADR 0012); `fuente` y `cargadoPor`, texto no vacío. `de` y `a` no pueden ser la
  misma moneda (por tipos, `A extends Exclude<Moneda, De>`, y en ejecución). Solo
  `crearTipoDeCambio` produce un `TipoDeCambio` (marca de tipo), así `convertir` nunca recibe un
  denominador en cero.
- **Redondeo (P5).** `convertir` calcula `centavos × numerador / denominador` en `bigint` y
  redondea con `redondearMitadLejosDelCero`, la **única** función de redondeo del dominio:
  half-up entendido como *la mitad se aleja del cero* (`1,5 → 2`, `−1,5 → −2`; `0,4999 → 0`,
  `0,5001 → 1`). Así convertir un negativo da el negativo de convertir el positivo.
- **Ida y vuelta, y por qué la cota es asimétrica.** Con TC `v` (USD → ARS) y su inverso `1/v`:
  - *USD → ARS → USD*: la ida redondea en centavos de ARS (error ≤ ½ centavo de ARS); al volver
    se divide por `v ≥ 1`, así que ese error pesa ≤ ½ centavo de USD, y el segundo redondeo deja
    el resultado a **lo sumo a 1 centavo** del original.
  - *ARS → USD → ARS*: la ida redondea en centavos de USD, y cada centavo de USD vale `v`
    centavos de ARS a la vuelta: el error de la ida (≤ ½ centavo de USD) se **amplifica por
    `v`**. La cota es `|diferencia| ≤ ⌈v/2⌉ + 1` centavos de ARS. No es un defecto del redondeo:
    la moneda intermedia no tiene resolución para más.

  Las dos cotas son propiedades de fast-check con TC de 1 a 5000 con hasta cuatro decimales y
  montos que incluyen cero y negativos.
- **Parseo** (`parsearImporte`, en el dominio porque devuelve un `Importe`, que `app` no puede
  construir). Regla explícita, también en el JSDoc: separador decimal **coma**; miles con
  **punto** opcional y en grupos de tres exactos; hasta **dos** decimales; `-` opcional adelante;
  parte entera obligatoria; espacios de las puntas ignorados, en el medio rechazados. Se aceptan
  `24.315,00`, `24315`, `24315,5`, `-24.315,00`. Se rechazan `24,315.00` (inglés), `24.31`,
  `1,234` (tres decimales), `""`, espacios intermedios y letras, con
  `DOMINIO.IMPORTE.TEXTO_INVALIDO`. Más de dos decimales no se redondea: es un error.
- **Formato para pantalla** (`USD 24.315,00`) en `src/app/formato/importe.ts`: es presentación,
  lee del dominio solo tipos (ADR 0004) y no usa `Intl`, así no depende de los datos de idioma de
  Node. Propiedad de ida y vuelta: `parsearImporte(formatearMonto(x)) = x`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `number` con decimales (`24315.5`) | Coma flotante: `0,1 + 0,2 ≠ 0,3`, y pierde precisión por encima de 2^53 |
| Centavos en `number` entero | Seguro solo hasta 2^53 centavos y nada impide que una división deje decimales; `bigint` hace imposible el error por tipos |
| `decimal.js` u otra librería decimal | Dependencia nueva para lo que resuelven `bigint` y una fracción; el dominio no importa paquetes (`dominio-puro`) |
| TC como decimal con escala fija | Su inverso (`1/1184,25`) no tiene expresión decimal finita: la vuelta ya redondearía antes de convertir |
| Moneda como `string` validado en ejecución | Sumar ARS con USD compilaría; la regla quedaría en la revisión y no en el compilador |
| Half-even (redondeo bancario) o half-up hacia +∞ | P5 dice half-up; hacia +∞ haría que convertir −x no fuera −convertir(x) |
| Parseo que adivina el formato (`24,315.00` como inglés) | Ambiguo: `1,234` sería mil doscientos o uno con 234; se rechaza y el usuario corrige |

## Consecuencias

- Ningún cálculo pierde ni inventa centavos: la aritmética es entera y el único redondeo está en
  un lugar, probado en el borde (`,5` con los dos signos, `,4999`, `,5001`) y como propiedad.
- Mezclar monedas es un error de compilación, no de revisión.
- Queda más difícil: todo lo que venga de afuera (base, formularios) tiene que pasar por
  `parsearImporte`, `parsearValorTipoDeCambio` o `crearImporte`. El mapeo de `bigint` a
  `BIGINT`/`NUMERIC` en Prisma es del adaptador y de otra tarea: no toca al dominio.
- `cargadoPor` es texto hasta que F0-22 fije el tipo del actor.
- Lo hacen cumplir `npm run typecheck` (los `@ts-expect-error`), `npm run test:dominio` (ejemplos
  y propiedades) y `npm run limites` (el formato en `app` solo importa tipos del dominio).

## Cómo se revierte

Todo vive en `src/dominio/compartido/importe.ts` y `src/app/formato/importe.ts`, con sus tests.
Cambiar la regla de redondeo es cambiar `redondearMitadLejosDelCero`; cambiar la regla de parseo,
`PATRON_MONTO` y su JSDoc; cambiar la representación del TC, `ValorTipoDeCambio` y
`parsearValorTipoDeCambio`. Nada fuera de esos archivos depende todavía de la representación.
