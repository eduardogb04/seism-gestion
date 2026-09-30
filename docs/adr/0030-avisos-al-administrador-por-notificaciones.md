# ADR 0030 — Los avisos al administrador van por el puerto `Notificaciones`, uno por cada administrador activo

> Archivo: `docs/adr/0030-avisos-al-administrador-por-notificaciones.md`. Numeración correlativa, nunca se reutiliza.

**Fecha:** 2026-09-30
**Estado:** Propuesto
**Tarea:** M-05
**Decide:** el orquestador de la tarea (resoluciones R1 a R5 de la ficha); reemplaza dos frases de los ADR 0025 y 0026

## Contexto

Dos avisos al administrador salían por el log porque el puerto `Notificaciones` (F0-29) todavía no estaba en `main`: el fallido que agotó sus reintentos (`INF-0002`, F0-25, ADR 0025: *"Aviso al administrador: por log, hasta que exista el puerto de notificaciones"*) y el tope de gasto de IA superado (`IA-0001`, F0-28, ADR 0026: *"el aviso del tope va por el log (`log/avisos-ia.ts`) hasta que el puerto esté en `main`: entonces se implementa `AvisosIa` con ese puerto"*). El puerto ya está.

## Decisión

Los dos avisos salen por `Notificaciones.enviar(destinatario, mensaje)`, **uno por cada administrador activo** (`rol: "administrador"` y `estado: "activo"` de `RepositorioUsuarios.listar()`; el destinatario es `{ tipo: "persona", usuarioId }`).

- **Quién los arma:** `src/infraestructura/arranque/avisos.ts`. `crearAvisarAdministradores({ notificaciones, usuarios, log })` devuelve `avisar(codigo, mensaje)`; `crearAvisosIa(avisar)` lo adapta al `AvisosIa` de `interpretar`; `armarAvisos` es el armado de Fase 0. Los casos de uso no importan infraestructura: `interpretar` sigue recibiendo `AvisosIa` (que ahora devuelve `Promise<void>`) y `conReintento` recibe `avisar` en sus dependencias (`crearConReintento({ cola, log, avisar })`).
- **`avisar` no lanza.** Un aviso que falla no puede tapar la operación que lo originó. Si `enviar` lanza o rechaza el mensaje, o si no se pueden leer los usuarios, lo loguea en `error` con su código (`aviso: <código del aviso>`) y sigue con el resto de los administradores. `conReintento` además atrapa lo que `avisar` lance: relanza siempre `INF-0002`.
- **Cero administradores activos:** no se envía nada y se escribe un `warn` con `codigo: <código del aviso>`.
- **El aviso no lleva datos de más:** el título trae el código y la descripción del catálogo; el cuerpo, los detalles del error (`origen`, `intentos`, `codigoCausa`; `acumulado`, `estimado`, `tope`, `mes`, `perfil`). Nunca la `carga` de la cola de fallidos ni la entrada que se quería interpretar.
- **Canal de Fase 0:** el adaptador `notificaciones-por-log` (`src/adaptadores/log/notificaciones.ts`, `crearNotificacionesPorLog(log)`) implementa el puerto con un `warn`: `destinatario` es solo el `usuarioId`, nunca el email. Pasa la misma suite de contrato que el doble en memoria (`tests/dominio/adaptadores-log-notificaciones.test.ts`). WhatsApp y Telegram son Fase 1.
- **Desaparece** `src/adaptadores/log/avisos-ia.ts`.

Esto reemplaza la frase citada del ADR 0025 y el párrafo citado del ADR 0026; el resto de ambos sigue igual.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Mandar el aviso a un solo administrador (el primero, o uno fijo) | Si ese usuario se revoca o no mira el canal, el aviso se pierde; la spec pide uno por cada administrador activo |
| Que un fallo del aviso se propague | Taparía el `INF-0002` o el `IA-0001`: el que llama dejaría de ver el error real |
| Una función de aviso en `src/casos-uso/` que lee los usuarios | Un caso de uso nuevo para algo que ya resuelve el armado; `interpretar` y `conReintento` alcanzan con una función inyectada |
| Dejar `avisos-ia.ts` "por las dudas" | Código muerto: nadie lo llama |

## Consecuencias

- Cuando llegue un canal real (Fase 1), el aviso cambia de canal sin tocar `conReintento` ni `interpretar`: se arma `avisar` con otro `Notificaciones`, que tiene que pasar la suite de contrato.
- `interpretar` espera el aviso antes de lanzar `IA-0001`: la respuesta al usuario tarda lo que tarde el canal.
- Nada arma hoy `conReintento` ni `interpretar` en un proceso real (solo los tests): el armado de producción llega con la primera tarea que los use, y ahí se suma `armarAvisos`.
- Lo hacen cumplir los tests de `tests/casos-uso/` (`avisos-administradores`, `reintento`, `ia-tope`) y `npm run limites` (el caso de uso no importa infraestructura).

## Cómo se revierte

Volver `AvisosIa` a `void`, sacar `avisar` de `DependenciasReintento` y restaurar `avisos-ia.ts` y el `warn` de `conReintento`. Toca `arranque/avisos.ts`, `reintento.ts`, `interpretar.ts`, `puertos/ia.ts` y sus tests.
