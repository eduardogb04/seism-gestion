# ADR 0007 — Imagen Docker: multi-stage, no root, publicada en GHCR y probada en CI

> Archivo: `docs/adr/0007-imagen-docker.md`. Numeración correlativa, nunca se reutiliza. Un ADR
> aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y este se marca
> *Reemplazado por NNNN*.

**Fecha:** 2026-09-14
**Estado:** Aprobado
**Tarea:** F0-07
**Decide:** el plan (criterio de F0-07, P8 retención, P9 tiempo de CI) y el orquestador de Fase 0
(dónde se verifica, qué excluye el `.dockerignore`, cómo se publica, retención, verificación de
secretos, mecanismo app/worker, ADR y número); el resto, el dev de F0-07

## Contexto

*"La máquina del servidor nunca compila."* El deploy del lote 3 necesita una imagen ya construida y
publicada; F0-07 la trae. La app ya compila a `standalone` (F0-04) y hay un portón de CI (F0-05).
Tres cosas condicionan la decisión: el repositorio y el paquete son **públicos** (una variable de
más adentro de la imagen es una filtración), `next build` **copia el `.env` al `standalone`** si
existe al compilar (aviso de F0-04), y **Docker no corre en la máquina de Eduardo** (Docker Desktop
está instalado pero nunca se aceptaron sus términos), así que el criterio *"`docker build` local y
`docker run -p 3000:3000` sirven `/` y `/api/salud`"* no se puede verificar ahí.

## Decisión

**Una sola imagen multi-stage, que corre como usuario no root y se construye, se prueba y se
publica desde CI; la prueba del contenedor es un comando del repo (`npm run imagen:prueba`), no una
lista de pasos a mano.**

1. **`Dockerfile` multi-stage.** `base` (imagen oficial de Node) → `dependencias` (`npm ci`, capa
   aparte para que se reuse mientras no cambie `package-lock.json`) → `construccion`
   (`npm run build`) → `final`, que copia solo `.next/standalone` y `.next/static`. La etapa final
   no tiene código fuente, ni `node_modules` de desarrollo, ni compilador.
2. **Base fijada por digest**, `node:24.14.1-alpine3.22@sha256:4f33c780…`, con el mismo criterio que
   las acciones de CI (ADR 0006): un tag se mueve, un digest no. Alpine por tamaño; Dependabot suma
   el ecosistema `docker` y sube tag y digest juntos.
3. **Usuario no root.** El usuario `node` (uid 1000) ya viene en la imagen oficial: `USER node`, sin
   crear nada. Los archivos quedan de root; el proceso los lee y no los escribe.
4. **`HEALTHCHECK` contra `/api/salud`** (el latido público de P13, el mismo que va a usar el
   deploy), con `fetch` de Node: sin `curl` ni `wget` en la imagen.
5. **Versión por `--build-arg APP_VERSION`.** `.git` no entra al contexto, así que sin ese argumento
   el build falla con el mensaje de `src/infraestructura/version.ts` (ADR 0005). CI le pasa el SHA
   corto del commit; `/api/salud` devuelve exactamente eso y `npm run imagen:prueba` lo compara.
6. **`.dockerignore`.** Primero `.env` y `.env.*`, por lo de arriba; después `.git`, `.github`,
   `node_modules`, `.next`, `tests/`, `docs/` y los documentos de la raíz. Menos contexto, menos
   superficie y ningún archivo local adentro de la imagen.
7. **Una imagen para app y worker.** No hay `ENTRYPOINT` propio: el `CMD` por defecto es
   `node server.js` (la app) y el worker (F0-25) va a correr **la misma imagen** sobrescribiendo el
   comando, que es el mecanismo que Docker ya da. No se inventa ningún guion de arranque ni ninguna
   variable de modo mientras el worker no exista.
8. **La prueba del contenedor es un comando del repo.** `scripts/imagen.ts`: `npm run imagen`
   construye y `npm run imagen:prueba` levanta el contenedor, espera a que el `HEALTHCHECK` lo dé
   por sano, pide `/` y `/api/salud`, compara la versión con la del build, verifica que la imagen no
   lleve secretos y que entre en el tope de tamaño; informa **todas** las verificaciones que
   fallaron, no la primera. Corre con Node pelado (no importa nada de `node_modules`), así que sirve
   igual en el runner y en cualquier máquina con Docker.
9. **Verificación de que la imagen no lleva secretos**, cuatro preguntas independientes:
   `find / -name '.env*'` adentro de la imagen no devuelve nada; `docker image inspect` no muestra
   ninguna variable fuera de la lista permitida (las tres de la imagen oficial de Node más
   `NODE_ENV`, `PORT`, `HOSTNAME` y `NEXT_TELEMETRY_DISABLED`); ninguna capa de `docker history
   --no-trunc` menciona un `.env`; y —la que más vale— **sin `APP_ENTORNO` en el entorno del
   proceso el contenedor sale 1** nombrando la variable que falta: si arrancara, sería porque se
   llevó un `.env` adentro.
10. **Dónde se verifica.** En el runner de CI, no en local: es lo que había. Los dos pasos
    (`imagen`, `imagen:prueba`) van en el job `ci`, así el check que F0-06 va a exigir sigue
    reflejando todo lo que corre en un PR. Los mismos comandos quedan en el `RUNBOOK.md` (sección
    14) para que Eduardo repita la prueba en su máquina cuando abra Docker.
11. **Publicación.** Job aparte, `publicar`: solo en `push` a `main`, `needs: ci`, y el único
    `permissions: packages: write` del workflow (la base sigue en `contents: read`). Construye,
    **vuelve a probar la imagen que va a empujar** y publica `ghcr.io/eduardogb04/seism-gestion` con
    dos etiquetas, el SHA del commit y `latest`. Solo `linux/amd64`; multi-arch queda como una línea
    comentada en el `Dockerfile` (contrato de portabilidad).
12. **Retención (P8): las últimas 5 versiones.** Un paso del mismo job lista las versiones del
    paquete con la API de GitHub (`gh`, que ya viene en el runner) y borra todas menos las 5 más
    nuevas. Sin acciones de terceros: no hay un SHA más que auditar y el criterio entra en diez
    líneas de shell.

### Tamaño de la imagen final

**206 MB** (`docker image inspect --format '{{.Size}}'`, del log de CI), contra un objetivo de
menos de 250 MB. `npm run imagen:prueba` lo verifica en cada corrida: si alguna dependencia lo pasa
de 250 MB, el check queda en rojo y se decide ahí, no se descubre en el servidor. De esos 206 MB, la
imagen base de Node aporta la mayor parte; la app y su `node_modules` trazado son unas decenas.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Verificar `docker build` y `docker run` en la máquina de Eduardo, como dice el criterio | Docker Desktop no arranca ahí (nunca se aceptaron sus términos). El runner de Ubuntu trae Docker y da además evidencia pública en el log de cada PR. La prueba local queda en el RUNBOOK, para cuando Docker abra |
| `docker/build-push-action` con caché de capas (`type=gha`), como sugería el riesgo del plan | Son tres o cuatro acciones de terceros más para fijar por SHA y auditar. Con este tamaño el build entero tarda alrededor de un minuto: la caché resolvería un problema que todavía no existe. Si el build creciera, se suma con su ADR |
| Publicar desde el job `ci` con un `if` | Los permisos son del job, no del paso: el job entero tendría `packages: write` también en los PR. Un job aparte deja el resto del workflow en solo lectura |
| Un job `imagen` aparte también para construir y probar en los PR | El check que F0-06 va a exigir se llama `ci`; con la construcción en otro job, un PR podría tener `ci` en verde con la imagen rota |
| `actions/delete-package-versions` para la retención | Otra acción de terceros para fijar y auditar, y por dentro hace los mismos dos llamados a la API. Con `gh` el paso se lee entero de una sentada |
| Imagen `slim` de Debian en vez de Alpine | Unos 100 MB más para el mismo resultado; el objetivo de tamaño es parte del criterio. Si alguna dependencia nativa no compilara contra musl, se revisa con su ADR |
| `ENTRYPOINT` propio que elija app o worker con una variable | Habría que inventar hoy el nombre y el arranque de un worker que existe en F0-25, o dejar una rama muerta. Sobrescribir el comando ya es el mecanismo de Docker |
| Etiquetar solo con `latest` | El deploy tiene que poder pedir exactamente el commit que se probó, y la retención necesita versiones distinguibles |
| Publicar también en cada rama | El registro se llenaría de versiones que nadie despliega y la retención de 5 borraría lo que sí importa |

## Consecuencias

- **La corrida de CI pasa de ~40 s a poco más de un minuto** (1 m 7 s la corrida verde de
  referencia: el paso `imagen` tarda unos 35 s, con `npm ci` y `next build` adentro del
  contenedor, e `imagen:prueba` unos 12 s). Sigue muy lejos del tope de 10 minutos de P9, pero es
  el paso más caro del portón y el primero a mirar si algún día se acerca.
- **La imagen se construye dos veces en un merge a `main`:** una en `ci` y otra en `publicar`. Es el
  precio de que el job con `packages: write` sea otro; a cambio, lo que se publica se prueba de
  nuevo antes de empujarse.
- **El paquete queda público, como el repo**, y su visibilidad es un paso manual de GitHub la
  primera vez (RUNBOOK, sección 15). Que sea público es también lo que permite que cualquiera
  audite lo que se afirma acá.
- **La retención borra versiones sin vuelta atrás.** Con 5 versiones se cubre volver atrás unos
  cuantos merges; si el deploy necesitara una imagen más vieja, se reconstruye desde el commit.
- **Si el `GITHUB_TOKEN` no alcanzara para borrar versiones** (el paquete es de una cuenta personal:
  el repositorio tiene que tener el rol *Admin* sobre el paquete), el paso queda en rojo con el
  error de la API. Cómo darle ese rol está en el RUNBOOK, sección 15; no se tapa el error ni se
  saca el paso.
- **La imagen no valida el entorno al construir, sí al arrancar** (ADR 0005): la misma imagen corre
  en `local`, `ci` y `servidor`. Sin `APP_ENTORNO` no arranca, y eso es parte de lo que se verifica.
- **Quien cambie el `Dockerfile` tiene que correr `npm run imagen && npm run imagen:prueba`** (o
  mirar el check `ci`, que lo corre igual).

## Cómo se revierte

Todo vive en `Dockerfile`, `.dockerignore`, `scripts/imagen.ts` y los dos bloques de
`.github/workflows/ci.yml`. Volver a Debian es cambiar la línea `FROM` y su digest. Sacar la
publicación es borrar el job `publicar`. Pasar a multi-arch es cambiar el `--platform` del script
por `buildx` con `--push` (y dejar de probar con `--load`, que no acepta dos plataformas). Cambiar
la retención es cambiar `CONSERVAR` en el paso, con su ADR si deja de ser 5 (P8).
