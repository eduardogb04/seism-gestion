# ADR 0006 — Portón de CI: un job `ci` con todos los controles, acciones fijadas por SHA y gitleaks

> Archivo: `docs/adr/0006-porton-ci.md`. Numeración correlativa, nunca se reutiliza. Un ADR
> aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*.

**Fecha:** 2026-09-11
**Estado:** Aprobado
**Tarea:** F0-05
**Decide:** DISENO (decisión 12, el portón) y el plan (P9 tiempo máximo, P14 gitleaks como segunda
red), con lo que fijó el orquestador de Fase 0 al despachar F0-05 (nombre del check, qué corre,
permisos, SHA fijos); el resto, el dev de F0-05

## Contexto

Hasta F0-04, "CI en verde" era correr a mano los comandos de `AGENTS.md`. F0-05 los convierte en
un portón: un workflow que corre en cada `push` y cada `pull_request` y queda en rojo si falla
cualquier control. F0-06 va a exigir ese resultado para fusionar en `main` como *required status
check* con un nombre fijo, así que el nombre del check es parte del contrato. El repo es público:
los logs de CI son públicos y una acción de terceros secuestrada correría con nuestros permisos.

## Decisión

**`.github/workflows/ci.yml` tiene un solo job, `ci`, que corre todos los controles en orden, con
permisos de solo lectura, 10 minutos de tope, acciones fijadas por SHA de commit y gitleaks sobre
los commits nuevos.**

1. **Nombre y forma.** Un job con id `ci` (sin `name`), así el check se llama exactamente `ci`.
   Un solo job en vez de varios en paralelo más un agregador: el `timeout-minutes` del job es el de
   la corrida entera (P9 sin cuentas), y el total hoy no llega al minuto.
2. **Qué corre.** `npm ci` y después `typecheck`, `typecheck:fixtures`, `lint`, `lint:fixtures`,
   `limites`, `limites:fixtures`, `test`, `build` y gitleaks. `typecheck:fixtures` no estaba en la
   lista del plan pero es del mismo tipo que los otros `*:fixtures` y existe desde F0-01.
3. **Todos los controles corren aunque falle uno.** Cada control tiene
   `if: ${{ !cancelled() && steps.dependencias.outcome == 'success' }}`: si `npm ci` anduvo, corren
   todos y el log muestra todos los rojos de una vez (no uno por intento). Cualquier paso que falla
   pone el job en rojo: **no hay `continue-on-error`** en ningún paso. Si la corrida se cancela
   (o la corta el tope de tiempo), no sigue.
4. **Disparadores.** `on: push` y `on: pull_request`, sin filtro de ramas ni de tags.
5. **P9.** `timeout-minutes: 10` en el job: si la corrida pasa de 10 minutos, GitHub la corta y el
   check queda en rojo.
6. **Permisos.** `permissions: contents: read` a nivel del workflow. El checkout no deja la
   credencial guardada en `.git/config` (`persist-credentials: false`): ningún paso posterior la
   necesita, y así un script de una dependencia no la encuentra.
7. **Acciones fijadas por SHA de commit completo**, con el tag en un comentario al lado, incluidas
   las de `actions/*`: `actions/checkout` `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) y
   `actions/setup-node` `820762786026740c76f36085b0efc47a31fe5020` (v7.0.0), verificados con
   `gh api repos/<dueño>/<acción>/commits/<tag>` (los dos tags apuntan directo al commit, no son
   tags anotados). Dependabot (`github-actions`, ya configurado desde F0-01) propone las subidas y
   actualiza SHA y comentario juntos.
8. **Node y caché.** `actions/setup-node` con `node-version-file: .nvmrc` (el runner lo toma de su
   caché de herramientas) y `cache: npm`, que guarda `~/.npm` con clave en el hash de
   `package-lock.json`. El criterio del plan dice "`node_modules` cacheados": con `npm ci` eso no
   sirve, porque `npm ci` borra `node_modules` y lo arma de cero; lo que se cachea es la descarga de
   los paquetes, que es lo caro.
9. **`build` sin `.env`.** `npm run build` no valida el entorno (ADR 0005); la versión del latido
   sale del SHA de git del checkout. `NEXT_TELEMETRY_DISABLED=1` para que el build no mande
   telemetría desde CI.
10. **gitleaks (P14), segunda red detrás de push protection.**
    - **Binario de un release fijo**, no la acción: `gitleaks_8.30.1_linux_x64.tar.gz`, bajado de
      los releases de `gitleaks/gitleaks` y verificado con `sha256sum --check` contra
      `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` **antes** de ejecutarlo.
      Ese valor es el del `gitleaks_8.30.1_checksums.txt` del release y coincide con el `digest`
      que GitHub calcula del archivo (`gh api repos/gitleaks/gitleaks/releases/latest`).
    - **Qué escanea:** en `pull_request`, los commits del PR (`base..cabeza`); en `push`, los que
      trajo el push (`before..sha`); si `before` no sirve (rama o tag nuevos, historia reescrita),
      lo que no está en la rama principal. Por eso el checkout trae el historial completo
      (`fetch-depth: 0`). Reglas: las que trae gitleaks por defecto, sin configuración propia.
    - **`--redact`:** el log dice regla, archivo, línea y commit, pero no el valor.

### Evidencia

| Prueba | PR | Resultado |
|---|---|---|
| Test roto a propósito (`tests/dominio/humo.test.ts` espera 3 de `1 + 1`) | https://github.com/eduardogb04/seism-gestion/pull/7 | `ci` en **rojo** en las dos corridas (`push` y `pull_request`); falló solo el paso `test`, los demás controles corrieron y pasaron. Cerrado sin fusionar, rama borrada |
| Secreto **falso** en formato genérico (`api_key = "…"`, 32 caracteres al azar, de ningún servicio) | https://github.com/eduardogb04/seism-gestion/pull/8 | Push protection **no** lo bloqueó (esperado: bloquea formatos de proveedores conocidos, probado en F0-01, ver RUNBOOK). gitleaks lo encontró (regla `generic-api-key`, valor `REDACTED` en el log) y `ci` quedó en **rojo** en las dos corridas; falló solo el paso de gitleaks. Cerrado sin fusionar, rama borrada enseguida. El valor no está en `main` ni en este ADR; queda solo en el commit del PR cerrado, que GitHub conserva, y no sirve para nada |

Duración real de la corrida verde de referencia (push de la rama `f0-05-ci`, primera corrida, sin
caché de npm todavía): **44 s** de punta a punta (41 s de job). `npm ci` 10 s, `build` 10 s,
`limites:fixtures` 4 s, el resto de a 0–2 s. Muy lejos de los 10 minutos de P9. Las dos corridas
del PR de esta tarea (#9), ya con la caché de npm en la de `push`: 37 s y 38 s.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Varios jobs en paralelo y un job final `ci` que los agrega | Cada job repite checkout y `npm ci`; con todo el total por debajo del minuto no se gana tiempo, y el tope de P9 deja de ser un solo `timeout-minutes` |
| Cortar en el primer control que falla (comportamiento por defecto) | Un agente arregla un rojo, empuja, y recién ahí ve el siguiente. Con los `if` de arriba ve todos de una vez sin tolerar ninguno |
| Acciones por tag (`@v7`) | Un tag se mueve: quien controle el repo de la acción cambia el código que corre acá sin que cambie este archivo. En un repo público eso es correr código ajeno con nuestros permisos |
| `gitleaks/gitleaks-action` fijada por SHA | No pide clave de licencia en una cuenta personal (sí en una organización, y desde su v2 tiene licencia propia, no MIT). Necesita `GITHUB_TOKEN` para leer el PR y, por defecto, comentar en él (más que `contents: read`), y por dentro igual baja el binario. El binario con checksum es más corto de auditar y no necesita ningún permiso |
| gitleaks sobre el historial entero en cada corrida | El criterio pide el diff del PR; lo que ya está en `main` pasó por el escaneo de su PR |
| Cachear `node_modules` (`actions/cache`) | Incompatible con `npm ci`, que lo borra; cachear `node_modules` y usar `npm install` es justo lo que el criterio prohíbe |
| `ubuntu-latest` | Cambia de versión solo; `ubuntu-24.04` cambia cuando lo decide un PR |
| Correr solo en `push` a `main` y en `pull_request` | El criterio pide cada `push`; además da señal en ramas antes de abrir el PR |

## Consecuencias

- `main` tiene un portón: un test roto, un límite violado, un fixture que deja de rechazar o un
  secreto genérico en el diff ponen `ci` en rojo. F0-06 lo hace obligatorio para fusionar.
- **Cada commit de una rama con PR abierto corre dos veces** (`push` y `pull_request`), las dos con
  check `ci`. Dan lo mismo salvo el rango de gitleaks, que en `push` de una rama nueva incluye
  todos los commits de la rama. Con repo público los minutos no tienen tope (plan, riesgos de
  F0-05).
- **Alcance de la caché de npm:** GitHub deja restaurar la caché de la propia rama o la de `main`.
  La corrida `pull_request` corre sobre `refs/pull/<N>/merge` y no ve la de la rama: usa la de
  `main`, que existe desde la primera corrida en `main` después de fusionar esta tarea. Antes de
  eso dice `npm cache is not found` y baja todo (10 s): no es un error.
- **gitleaks no lo sube Dependabot**: versión y SHA-256 están en `ci.yml`. Para subirlo: tomar el
  valor de `gitleaks_<versión>_checksums.txt` del release nuevo, compararlo con el `digest` del
  archivo en `gh api repos/gitleaks/gitleaks/releases/tags/v<versión>`, y cambiar
  `GITLEAKS_VERSION` y `GITLEAKS_SHA256` en el mismo PR. Si el checksum no coincide, la descarga
  falla y `ci` queda en rojo: es lo que tiene que pasar.
- Un falso positivo de gitleaks se resuelve con un `.gitleaksignore` con el *fingerprint* que
  imprime el log (y el motivo en el PR), nunca sacando el paso.
- `next build` imprime en CI `⚠ No build cache found` porque no se cachea `.next/cache`. Es un
  aviso de Next sobre velocidad, no del código; el build tarda 10 s. Si algún día pesa, se cachea
  `.next/cache` con `actions/cache` fijada por SHA.
- **Para F0-07:** el job de la imagen va en este workflow con su propio bloque
  `permissions: packages: write` (la base sigue en `contents: read`), `needs: ci` y su propio
  `timeout-minutes`. `setup-node` recomienda no usar su caché en jobs con permisos elevados.
- **Para F0-06:** el *required status check* se llama `ci`.

## Cómo se revierte

Todo vive en `.github/workflows/ci.yml`. Pasar a varios jobs es partir los pasos y agregar un job
`ci` final con `needs:` que falle si alguno no terminó en `success` (el nombre del check no cambia).
Pasar a la acción de gitleaks es reemplazar los dos pasos de gitleaks por la acción fijada por SHA
y darle los permisos que pida. Si alguna vez se quiere volver a tags en las acciones, se escribe un
ADR que reemplace a este: no se hace en silencio.
