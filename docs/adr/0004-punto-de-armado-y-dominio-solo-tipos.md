# ADR 0004 — El punto de armado es `infraestructura/arranque` y las entradas leen el dominio solo por tipos

> Archivo: `docs/adr/0004-punto-de-armado-y-dominio-solo-tipos.md`. Numeración correlativa, nunca
> se reutiliza. Un ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo
> reemplaza y este se marca *Reemplazado por NNNN*.

**Fecha:** 2026-09-11
**Estado:** Aprobado
**Tarea:** F0-03
**Decide:** el plan (tabla *Límites que dependency-cruiser hace cumplir*, fila `src/app` y
`src/worker`), con la lectura que fijó el orquestador de Fase 0 al despachar F0-03

## Contexto

La fila de `src/app` y `src/worker` de la tabla de límites del plan dice dos cosas que, tal como
están escritas, no alcanzan para escribir una regla: que pueden importar `adaptadores` "solo en el
punto de armado (`arranque`)", y que no pueden importar el `dominio` "directo para escribir (leer
tipos sí)". Hay que decir **qué carpeta** es el punto de armado y **qué import** cuenta como "leer
tipos", porque dependency-cruiser necesita una ruta y un tipo de dependencia, no una intención.

## Decisión

**1. Punto de armado.** El único lugar fuera de `src/adaptadores` que puede importar
`src/adaptadores` es `src/infraestructura/arranque/**` (la carpeta que el plan ya ubica dentro de
`infraestructura`). `app` y `worker` no importan adaptadores: importan de `arranque/`, que arma los
casos de uso con los adaptadores que correspondan. El resto de `infraestructura` (entorno, log)
tampoco importa adaptadores. Regla: `adaptadores-solo-en-arranque`.

**2. Dominio solo por tipos.** `app` y `worker` solo pueden importar `src/dominio` con
dependencias de solo tipos, que la compilación borra: `import type` / `export type` (tipo
`type-only` en dependency-cruiser) e `import("...")` en posición de tipo (`type-import`). Cualquier
otro import del dominio desde una entrada, incluido uno mixto que trae un tipo y un valor, es
violación. dependency-cruiser los distingue con `tsPreCompilationDeps: true`, que analiza el
TypeScript antes de compilar. Regla: `app-worker-dominio-solo-tipos`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Que `app` y `worker` importen adaptadores directo | Habría tantos lugares donde se elige un adaptador como entradas y archivos que los usen. Cambiar un proveedor (o poner el doble en un test) dejaría de ser tocar un solo lugar |
| Un punto de armado dentro de cada entrada (`src/app/arranque`, `src/worker/arranque`) | Dos armados que tienen que coincidir; el worker no debería depender de la estructura de Next.js ni al revés |
| Una carpeta `src/arranque` en la raíz de `src/` | El plan ya pone `arranque` dentro de `infraestructura`, y una carpeta más en `src/` es una fila más en la tabla sin nada que la justifique |
| Un contenedor de inyección de dependencias | Una dependencia más, fuera de la tabla de herramientas, para algo que a esta escala es un archivo que llama constructores |
| Prohibir el dominio entero desde `app` y `worker` | La tabla dice "leer tipos sí". Sin eso, cada caso de uso tendría que reexportar o duplicar los tipos que la pantalla necesita mostrar |
| Permitir cualquier import del dominio desde las entradas | Una pantalla podría ejecutar reglas del dominio salteando el caso de uso, que es donde se valida, se audita y se persiste |
| Hacer cumplir "solo tipos" con una regla de lint en vez de dependency-cruiser | Los límites entre capas quedarían repartidos en dos herramientas. Biome igual participa, pero solo para el hueco de abajo |

## Consecuencias

- Se gana: cambiar un adaptador por otro, o por su doble, se hace en un solo lugar. Una entrada no
  puede saltearse los casos de uso para escribir, y lo frena la máquina, no la revisión.
- Hueco conocido: `import { type X } from "..."` (modificador `type` inline, sin ningún valor)
  dependency-cruiser lo clasifica igual que `import type`, pero TypeScript con
  `verbatimModuleSyntax` deja ese import en el JavaScript y el módulo del dominio se carga. Lo
  cierra Biome: `useImportType` (en `error` desde F0-02, ADR 0003) rechaza esa forma y exige
  `import type`. Si alguien baja esa regla de Biome, el hueco se abre.
- `tsPreCompilationDeps` también hace que `no-circular` vea los ciclos que existen solo por
  tipos. Se aceptan como violación: un ciclo de tipos entre dos módulos es tan acoplamiento como
  uno de valores.
- `arranque/` va a ser el archivo que más cambia cuando llegan adaptadores (lotes 2, 7 y 8). Si
  crece demasiado se parte **dentro** de `arranque/`, sin que la regla cambie.
- dependency-cruiser 18.2.0 parsea TypeScript `>=2 <7`: es un segundo motivo para mantener
  TypeScript en 6.x (el primero, en ADR 0002). Subir TypeScript a 7 exige revisar las dos cosas.
- Quién lo hace cumplir: `npm run limites` (reglas `adaptadores-solo-en-arranque` y
  `app-worker-dominio-solo-tipos`), probado por `npm run limites:fixtures` con un fixture por
  regla que incluye el caso permitido (`arranque/` importando un adaptador; `import type` y
  `export type` del dominio desde `app` y `worker`).

## Cómo se revierte

Se tocan dos reglas de `.dependency-cruiser.cjs` y sus dos fixtures en `tests/fixtures/limites/`.
Para mover el punto de armado: cambiar la ruta de `pathNot` en `adaptadores-solo-en-arranque`.
Para permitir imports de valor del dominio: borrar `app-worker-dominio-solo-tipos` (y su fixture,
o el script de fixtures va a fallar por fixture sin regla). El código que ya dependa de estas
reglas no hay que tocarlo: afloja una restricción, no cambia ninguna API.
