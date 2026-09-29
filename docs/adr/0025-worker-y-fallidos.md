# ADR 0025 — El worker: croner sin compilador, registro de cada corrida y cola de fallidos

> Archivo: `docs/adr/0025-worker-y-fallidos.md`. 0021–0024 están tomados o reservados por otras
> tareas del lote 6; 0026 es de F0-28.

**Fecha:** 2026-09-28
**Estado:** Propuesto
**Tarea:** F0-25
**Decide:** el plan (F0-25, P11: "worker (`croner`)") y el orquestador (resoluciones de la tarea)

## Contexto

*"Nada falla en silencio, y menos la ingesta."* El worker no tenía dueño (hueco A5): no existía el
proceso, ni un lugar donde quedara cada corrida de un job, ni qué pasa con lo que falla después de
reintentar. Esta tarea crea el proceso con un job `latido`, las tablas `corridas_worker` y
`fallidos` que va a leer el panel de salud (F0-26), el helper de reintento y `listarSalud()`.

## Decisión

**Un proceso aparte, `node src/worker/index.ts`, con un `Cron` de `croner` por job; toda corrida
pasa por un envoltorio que la registra, y lo que agota sus reintentos queda en `fallidos` y se
relanza con código.**

- **Cómo corre (sin compilador).** `npm run worker` = `node src/worker/index.ts`, con el soporte
  nativo de TypeScript de Node 24 (el mismo que usan `scripts/*.ts`): imports con extensión `.ts`,
  sin `enum`, sin alias. No hay `tsx`, `esbuild` ni paso de build. En la imagen es **la misma
  imagen** que la app con otro comando (sin `ENTRYPOINT`): la etapa final suma el código que el
  worker importa (`src/worker`, `infraestructura`, `adaptadores` con el cliente de Prisma
  generado, `puertos`, `dominio`) y sus dependencias de producción, instaladas aparte con las
  versiones del lockfile y **sin** `next`/`react`/`react-dom` (ya están en el `standalone`). Del
  cliente de Prisma se deja solo el compilador de consultas de PostgreSQL, y se sacan tipos y
  mapas de fuente. `npm run imagen:prueba` verifica que el worker sin `DATABASE_URL` no arranca
  (sale ≠ 0 nombrando la variable) y que con el entorno completo arranca y sigue corriendo.
- **Entorno.** El worker valida con `exigirEntornoValido("el worker")`, el mismo esquema Zod de la
  app (`src/infraestructura/entorno.ts`), no una copia. Después instala los manejadores de
  excepciones no capturadas de F0-24.
- **Registro de cada corrida.** `registrarCorrida(job, fn)` (`src/worker/registrar-corrida.ts`) es
  el único camino por el que corre un job: inserta la fila con `inicio` **antes**, corre `fn`, y en
  `finally` pone `fin` y `resultado` (`ok`/`error`, enum de Postgres); con error, `detalle` =
  `CODIGO · descripción · causa: mensaje`, redactado con `redactar` (F0-24). Relanza el error: el
  planificador lo loguea con su código y **sigue** (la corrida siguiente corre igual). `protect`
  de croner evita que un job lento se solape consigo mismo. El reloj (`ahora`) se inyecta.
- **`latido`**: `*/5 * * * *`, no hace nada más que registrarse. Si su última corrida es vieja, el
  worker está caído.
- **Reintento.** `conReintento(fn, politica)` (`src/infraestructura/reintento.ts`, armado con
  `crearConReintento({ cola, log })`): 3 intentos en total por defecto, esperas
  `[1000, 10000, 60000]` ms configurables (la i-ésima va antes del intento i+1; con más intentos
  que esperas se repite la última), y la espera se inyecta (`politica.esperar`) para que los tests
  no duerman. **Si agota: encola, loguea y relanza.** Encola en `ColaFallidos` (origen, código del
  último error —`INF-0001` si no tenía—, carga, intentos), loguea en `error` con `INF-0002` (nuevo
  en el catálogo) y el código de la causa, y **lanza** un `ErrorSistema` `INF-0002` con el último
  error como causa. Se eligió relanzar y no devolver un `Resultado` porque `conReintento` envuelve
  llamadas a bordes (adaptadores) que ya lanzan, y un `Resultado` que el que llama puede ignorar
  es justo la falla silenciosa que se quiere evitar. Si ni siquiera se puede encolar (la base está
  caída), lo dice en el log (`encolado: false`) y relanza igual.
- **Aviso al administrador: por log**, hasta que exista el puerto de notificaciones (F0-29).
- **`listarSalud()`** (`src/casos-uso/salud/`) recibe sus puertos por parámetro y **nunca lanza**:
  una sonda que rechaza queda en `error`, y si no se pudo leer una corrida o los pendientes, lo
  dice (`error` en el job, `fallidosPendientes: null`) en vez de mostrar "nunca corrió" o un cero.
  Los detalles son `CODIGO · descripción` del catálogo, nunca el mensaje crudo de una excepción.
- **Esquema.** `corridas_worker` (`inicio` hace de `creado_en`; índice por `job, inicio desc`) y
  `fallidos` (`carga` `jsonb`, `proximo_intento` nulo porque en Fase 0 nadie reintenta solo, índice
  **parcial** sobre `resuelto_en IS NULL` con el preview `partialIndexes` de Prisma 7.10, que
  además mantiene el índice en `schema.prisma` y el control de drift lo ve).
- **`conReintento` y los helpers de fallas viven en `src/infraestructura/`**, no en `src/worker/`:
  construyen errores del catálogo (`nuevoError`) y el worker solo puede importar tipos del dominio
  (regla `app-worker-dominio-solo-tipos`). Además los van a usar adaptadores (ingesta, IA), que
  pueden importar infraestructura pero no worker.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Compilar el worker con `tsc`/`esbuild`, o correrlo con `tsx` | Una herramienta y un paso de build más para algo que Node 24 ya corre. Los scripts del repo ya corren así |
| Una imagen aparte para el worker | Dos imágenes que publicar, versionar y probar; el diseño pide la misma imagen con otro comando |
| Copiar todo el `node_modules` de producción a la imagen final | `next` y `@next/*` suman ~300 MB: la imagen se pasa del tope de 250 MB |
| `conReintento` que devuelve `Resultado` de fallo | El que llama lo puede ignorar sin que nada lo avise; relanzar obliga a hacerse cargo |
| `conReintento` con `setTimeout` fijo | Los tests tendrían que dormir 11 s por caso o usar relojes falsos globales; la espera inyectada deja afirmar la secuencia exacta |
| Registrar solo las corridas que terminan, o poner `fin` fuera de un `finally` | Una corrida que lanza quedaría sin `fin` o sin fila: justo la que más importa ver |
| Índice común sobre `resuelto_en` | Sirve, pero indexa también los resueltos, que van a ser casi todos; el parcial es exacto para "pendientes" |

## Consecuencias

- Cada corrida de cada job queda en la base, con resultado, pase lo que pase; el panel de salud
  (F0-26) lee `listarSalud()` y ve si el worker late, qué falló y qué está pendiente.
- Nada que agote sus reintentos se pierde: queda en `fallidos` con su código, y el que llamó ve el
  error.
- La imagen crece con las dependencias del worker (tamaño antes y después en el informe de la
  tarea y en `AGENTS.md`, *Imagen Docker*). La lista de lo que **no** entra (`next`, `react`,
  `react-dom`) está en el `Dockerfile`; un paquete nuevo del worker entra solo, y si faltara algo,
  `imagen:prueba` arranca el worker y lo detecta.
- **Riesgo de Fase 1: dos réplicas del worker** correrían cada job dos veces. En Fase 0 hay una
  sola. Salida: cada corrida toma un bloqueo consultivo de Postgres
  (`pg_try_advisory_lock(hash del job)`) dentro de `registrarCorrida` y, si no lo consigue, no
  corre.
- Lo hacen cumplir: `tests/casos-uso/worker.test.ts` (registro, planificador vivo, entorno),
  `tests/casos-uso/reintento.test.ts` (esperas, cola, relanzar), `tests/casos-uso/salud.test.ts`
  (nunca lanza), `tests/casos-uso/migraciones.test.ts` (la migración y su `down.sql`) y
  `npm run imagen:prueba` (el worker en la imagen).

## Cómo se revierte

- El worker es un proceso aparte: sacar su servicio del compose y el comando de la imagen no toca
  la app.
- El esquema: `npm run db:migrate:down` con el `down.sql` de `corridas_worker_fallidos` (borra las
  dos tablas, el índice parcial y el enum), y sacar `previewFeatures` de `schema.prisma`.
- Para compilar en vez de TypeScript nativo: una etapa de build del worker en el `Dockerfile` y
  cambiar el comando; el código no cambia.
- Cambiar la política de reintento es cambiar `INTENTOS_POR_DEFECTO`/`ESPERAS_POR_DEFECTO` o
  pasar otra política: los que llaman no cambian.
