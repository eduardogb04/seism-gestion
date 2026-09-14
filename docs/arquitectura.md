# Arquitectura

> Primera versión (F0-03): las capas y sus límites, aterrizados en las carpetas reales del repo.
> F0-04 suma los archivos de Next.js (ADR 0005).
> Es la sección 1 del documento de diseño del sistema (*Arquitectura y modelo de dominio*, que
> vive fuera de este repositorio) llevada a reglas que una máquina hace cumplir. Los módulos de
> negocio se suman acá cuando existan.

## Capas

```
  Entradas                     Núcleo                         Salidas
  ────────                     ──────                         ───────
  src/app     ─┐                                         ┌─  src/adaptadores
               ├──►  src/casos-uso  ──►  src/dominio     │   (base, archivos, IA,
  src/worker  ─┘            │                            │    correo, identidad...)
                            └──►  src/puertos  ◄─────────┘
                                  (interfaces que los adaptadores implementan)

  src/infraestructura/arranque: el punto de armado. Conecta cada puerto con su adaptador
  y se lo entrega a las entradas.
```

El dominio no sabe quién lo llamó ni dónde se guarda lo que produce: se testea solo, sin
framework ni base. Todo lo de afuera (base, proveedor de IA, correo, identidad) está detrás de un
puerto y es reemplazable cambiando un adaptador y una línea del punto de armado.

## Carpetas

| Carpeta | Qué va |
|---|---|
| `src/dominio` | Reglas y tipos del negocio. Puro: solo importa de sí mismo |
| `src/casos-uso` | Orquestan el dominio contra los puertos. Una operación del sistema = un caso de uso |
| `src/puertos` | Interfaces que el núcleo le pide al afuera (repositorios, almacén, IA, correo, identidad...) |
| `src/adaptadores` | Implementaciones concretas de los puertos, y sus dobles para tests |
| `src/infraestructura` | Entorno validado, log, y `arranque/`: el punto de armado |
| `src/app` | Next.js (App Router). Una entrada: recibe pedidos y los pasa a casos de uso. `src/instrumentation.ts` (lo levanta Next al arrancar; tiene que vivir en la raíz de `src/`) es parte de esta entrada |
| `src/worker` | Proceso aparte (planificador y jobs). La otra entrada, con las mismas reglas que `app` |

## Límites

Los hace cumplir `npm run limites` (dependency-cruiser, reglas en `.dependency-cruiser.cjs`, todas
en `error`). Si uno se viola, el comando sale distinto de 0 y, desde F0-05, CI queda en rojo.

| Desde | Puede importar | No puede importar | Regla |
|---|---|---|---|
| `src/dominio` | `src/dominio` | Todo lo demás: otras carpetas de `src/`, paquetes npm (`@prisma/*`, `next`, `zod`...) y módulos de Node (`node:*` o sin prefijo). Vale aunque el paquete no esté instalado | `dominio-puro` |
| `src/casos-uso` | `src/dominio`, `src/puertos` | `src/adaptadores`, `src/app`, `src/worker`, `src/infraestructura`, `@prisma/*` | `casos-uso-sin-afuera` |
| `src/puertos` | `src/dominio` (y otros puertos) | Todo lo demás, paquetes npm y módulos de Node incluidos | `puertos-solo-dominio` |
| `src/adaptadores` | `src/dominio`, `src/puertos`, `src/infraestructura`, paquetes npm, Node | `src/casos-uso`, `src/app`, `src/worker` | `adaptadores-sin-casos-uso-ni-entradas` |
| `src/app` (con `src/instrumentation.ts`) y `src/worker` | `src/casos-uso`, `src/puertos`, `src/infraestructura` (incluido `arranque/`), **tipos** de `src/dominio` | `src/adaptadores` directo; **valores** de `src/dominio` | `adaptadores-solo-en-arranque` · `app-worker-dominio-solo-tipos` |
| `src/infraestructura` | Sin restricciones propias, salvo la del punto de armado | `src/adaptadores`, excepto desde `src/infraestructura/arranque/` | `adaptadores-solo-en-arranque` |
| Todo lo analizado | — | Ciclos de dependencias (también los que existen solo por tipos) | `no-circular` |
| `src/` | — | Módulos sueltos: que no importan nada y que nadie importa | `no-orphans` |

### El punto de armado

`src/infraestructura/arranque/` es el **único** lugar fuera de `src/adaptadores` que puede
importar un adaptador. Ahí se decide qué implementación va detrás de cada puerto (la real, el
doble en memoria, la de disco o la de S3) y se arman los casos de uso. `app` y `worker` importan
de `arranque/`, nunca de `adaptadores/`; el resto de `infraestructura` (entorno, log) tampoco
importa adaptadores. Cambiar un proveedor es tocar un adaptador y `arranque/`, nada más. Ver
ADR 0004.

### Dominio desde las entradas: leer tipos sí, escribir no

`app` y `worker` pueden **nombrar** tipos del dominio (para tipar lo que muestran o lo que reciben
de un caso de uso), pero no **ejecutar** nada del dominio: toda operación pasa por un caso de uso.
En la práctica:

| Forma | Se permite |
|---|---|
| `import type { X } from "../dominio/..."` | Sí |
| `export type { X } from "../dominio/..."` | Sí |
| `type Y = import("../dominio/...").X` | Sí |
| `import { crearX } from "../dominio/..."` (un valor) | No: `app-worker-dominio-solo-tipos` |
| `import { crearX, type X } from "../dominio/..."` (mixto) | No: trae un valor |
| `import { type X } from "../dominio/..."` (inline, sin valores) | No, pero lo frena **Biome**, no dependency-cruiser |

La última fila es un hueco conocido: dependency-cruiser marca ese import como de solo tipos, pero
TypeScript (con `verbatimModuleSyntax`) lo deja en el JavaScript y el módulo del dominio se carga
igual. La regla `useImportType` de Biome (en `error`, `npm run lint`) lo rechaza y exige
`import type`. Ver ADR 0004.

### Lo que la tabla del plan no dice textual

- **`worker` en las filas de `casos-uso` y `adaptadores`.** La tabla del plan no lo nombra en la
  columna "No puede importar" de esas filas, pero tampoco en "Puede importar", y le da a `worker`
  la misma fila que a `app`: es una entrada, y ninguna capa del núcleo ni un adaptador conoce a
  sus entradas.
- **`src/infraestructura` no tiene fila propia.** Su única restricción sale de la del punto de
  armado. Que `casos-uso` no la importe sale de la fila de `casos-uso`.
- **Paquetes npm en `casos-uso`.** La tabla solo prohíbe `@prisma/*`; otros paquetes (por ejemplo
  una librería de validación) no están prohibidos por dependency-cruiser. En `dominio` y en
  `puertos` sí: ahí la tabla dice "todo lo demás".

## Qué analiza `npm run limites`

- **Carpetas:** `src/`, `tests/` y `scripts/`, archivos `.ts` y `.tsx`. Los archivos de
  configuración de la raíz (`next.config.ts` incluido) no son código de la arquitectura y no
  entran. Los `README.md` tampoco: dependency-cruiser solo lee JavaScript y TypeScript.
- **`tests/` y `scripts/`** entran para que `no-circular` los vea y para que un módulo de `src/`
  usado solo por su test no cuente como suelto. Las reglas por capa miran solo `src/`: un test
  puede importar lo que necesite (las suites de `tests/contratos/` ejercitan adaptadores).
- **`no-orphans`** excluye `tests/` y `scripts/`: cada test lo levanta Vitest y cada script lo
  levanta `node` desde `package.json`. Excluye también los archivos que Next.js carga por su
  nombre sin que nadie los importe: `page`, `layout` y `route` en cualquier carpeta de
  `src/app/`, y `src/instrumentation.ts` (ADR 0005). Son puntos de entrada, no código muerto; un
  `.tsx` suelto con otro nombre sí es huérfano.
- **`tests/fixtures/`** queda fuera del análisis: son archivos que **tienen** que violar reglas.
- **El cliente generado de Prisma** (`src/adaptadores/prisma/generado/`, F0-08, ADR 0008) sí se
  analiza: es un adaptador más, y las reglas por capa le aplican a quien lo importe (el fixture de
  `casos-uso-sin-afuera` lo prueba). Solo `no-circular` ignora los ciclos que **empiezan** en él:
  Prisma genera archivos que se importan entre sí.

## Cómo se prueba

`npm run limites:fixtures` (`scripts/limites-fixtures.ts`) corre dependency-cruiser sobre cada
carpeta de `tests/fixtures/limites/`, **una por regla** y cada una por separado. Cada fixture
replica la estructura `src/...` que la regla necesita y trae archivos que la violan y archivos que
no (el caso permitido: el `import type` del dominio desde `app`, el punto de armado importando un
adaptador, el dominio importando del dominio). El script sale 0 solo si cada fixture fue
rechazado por su regla y exactamente desde los archivos esperados; sale 1 si alguno pasa, si lo
rechaza otra regla, si un archivo permitido aparece como violación, o si hay una regla sin fixture.

## Cómo se cambia un límite

1. Un ADR nuevo en `docs/adr/` que diga qué cambia y por qué.
2. La regla en `.dependency-cruiser.cjs`, comentada en castellano.
3. Su fixture en `tests/fixtures/limites/<nombre-de-la-regla>/`, declarado en
   `scripts/limites-fixtures.ts` (el script falla si una regla no tiene fixture).
4. Esta página y `AGENTS.md`.
