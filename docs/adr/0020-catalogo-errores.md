# ADR 0020 — Catálogo de errores con código estable, que nunca se reutiliza

> Archivo: `docs/adr/0020-catalogo-errores.md`. Numeración correlativa, nunca se reutiliza. Un ADR
> aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*.

**Fecha:** 2026-09-25
**Estado:** Propuesto
**Tarea:** F0-23
**Decide:** el plan (F0-23: *"La operadora manda 'me tiró ING-0012' y Eduardo sabe qué pasó sin
adivinar"*; *"es imposible lanzar un error sin código, obligado por los tipos"*)

## Contexto

Hasta F0-23 cada módulo del dominio inventaba su código (`DOMINIO.HISTORIAL.TRANSICION_INVALIDA`,
`DOMINIO.IMPORTE.TEXTO_INVALIDO`...) y nada impedía `throw new Error("...")`. Un error sin código
estable no se puede buscar en el log a partir de lo que ve la persona en pantalla, y un código que
cambia de significado vuelve inútiles los reportes viejos.

## Decisión

Todo error tiene un código estable de un único catálogo, `src/dominio/compartido/errores/catalogo.ts`,
y **un código nunca se reutiliza**: una entrada no se borra ni cambia de tipo.

- **Entrada.** `{ codigo, tipo, descripcion, queHacer }`. `codigo` es `PREFIJO-NNNN`, con prefijo
  por módulo (`DOM` dominio, `AUT` autenticación, `ING` ingesta, `INF` infraestructura, `IA`, `ALM`
  almacén de documentos) y cuatro dígitos; es un template literal type, así que otra forma no
  compila. La clave del objeto es el código con guion bajo (`DOM_0001`): `definirCatalogo` no
  compila si clave y código no coinciden. `tipo` es `persona` (lo resuelve quien usa el sistema),
  `sistema` (falla nuestra) o `externo` (falló algo de afuera). `descripcion` es lo que se ve en
  pantalla; `queHacer`, lo que hay que hacer.
- **El catálogo entero es un golden file** (`tests/extraccion/golden/catalogo-errores.json`, arnés
  de F0-16). Agregar una entrada o cambiar un texto rompe `npm run test:extraccion` hasta
  regenerarlo a propósito con `npm run test:golden:update` y revisar el diff. Antes de comparar
  (y antes de reescribir, en modo actualización), el mismo test verifica contra el golden
  versionado que ningún código se haya borrado ni cambiado de tipo: eso no se destraba
  regenerando.
- **Un error que ya no se usa queda en el catálogo**, con su texto. El próximo número de un
  prefijo es siempre el siguiente al más alto que exista.
- **El dominio sigue sin lanzar por reglas de negocio**: devuelve `Resultado`, y el `codigo` del
  error es el del catálogo (`catalogo.DOM_0001.codigo`). Los códigos `DOMINIO.*` sueltos
  desaparecen. Esto reemplaza lo que decía el ADR 0010 sobre conservar
  `DOMINIO.HISTORIAL.TRANSICION_INVALIDA`: la transición inválida es `DOM-0001`.
- **`ErrorSistema` es lo que se lanza en los bordes** (casos de uso, infraestructura,
  adaptadores). Su constructor es `private`; lo construye solo `nuevoError(entrada, detalles,
  causa?)`, que recibe una entrada del catálogo. Se muestra de dos formas con el mismo código:
  `paraPantalla` → `{ codigo, tipo, mensaje }` (el mensaje es la descripción; ni detalles, ni
  causa, ni pila) y `paraLog` → `{ codigo, tipo, detalles, causa, pila }`.
- **`throw new Error` no existe en `src/dominio` ni en `src/casos-uso`.** Biome 2.5.13 no tiene
  una regla para eso (`useThrowOnlyError`, que queda en `error`, solo prohíbe lanzar lo que no es
  un `Error`), así que `scripts/sin-error-crudo.ts` lo busca con la API del compilador de
  TypeScript, igual que `sin-any.ts`: rechaza `throw new Error(...)`, `throw Error(...)` (y los
  demás errores nativos) y `new ErrorSistema(` (salvo en el archivo que define la clase). Corre
  en `npm run lint`, después de Biome, y su fixture (`tests/fixtures/lint/error-crudo/`) está en
  `npm run lint:fixtures`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un catálogo por módulo | El código es para buscarlo; con varios archivos, nada impide que dos módulos usen el mismo número ni hay un solo golden que lo cuide |
| Golden de solo los códigos | Cambiar el texto o el tipo de un código cambia lo que la persona lee o a quién le toca resolverlo: tiene que romper igual |
| Borrar entradas que ya no se usan | Un reporte viejo con ese código dejaría de tener explicación, y el número quedaría libre para otra cosa |
| Constructor "privado" por convención (`_`, JSDoc) | No lo hace cumplir nadie; `private` lo hace cumplir `tsc` y el test de tipos con `@ts-expect-error` |
| Prohibir `throw new Error` solo con documentación, o con `noRestrictedGlobals` sobre `Error` | Lo primero no lo verifica nadie; lo segundo también marcaría `instanceof Error` y los tipos, que son legítimos |
| Que el dominio lance `ErrorSistema` | Las reglas de negocio ya devuelven `Resultado` (ADR 0010, 0018): lanzar mezclaría flujo normal con fallas |

## Consecuencias

- El código que ve la persona es el que se busca en el log, y significa siempre lo mismo.
- Agregar un error es una entrada en `catalogo.ts` y regenerar el golden; el diff del golden se
  revisa a mano.
- El catálogo solo crece. Una descripción se puede mejorar (regenerando), pero el tipo no.
- Lo hacen cumplir: `tsc` (forma del código, clave ↔ código, constructor privado), el golden y su
  chequeo de reutilización (`npm run test:extraccion`), `tests/dominio/errores.test.ts` (forma de
  cada entrada, serialización) y `npm run lint` (`sin-error-crudo`, con su fixture en
  `lint:fixtures`).
- La traducción de `ErrorSistema` a HTTP no está acá: llega con F0-25.

## Cómo se revierte

El catálogo está en un solo archivo y los errores del dominio lo nombran por su clave: volver a
códigos por módulo es cambiar esas referencias y borrar el golden. `sin-error-crudo` se saca de
`npm run lint` y de `lint:fixtures` sin tocar nada más.
