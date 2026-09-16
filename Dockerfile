# Imagen de la app (F0-07). Decisiones y porqués: docs/adr/0007-imagen-docker.md.
#
# "La máquina del servidor nunca compila": la imagen se construye en CI y se
# publica en GHCR. Multi-stage: la etapa `construccion` tiene el código fuente,
# las dependencias de desarrollo y el compilador; la etapa `final` se lleva solo
# el `standalone` que deja `next build` (un `server.js` con el `node_modules`
# mínimo que Next traza) y corre como usuario no root.
#
# La versión del latido (`GET /api/salud`) entra como `--build-arg APP_VERSION`:
# `.git` no entra al contexto (`.dockerignore`), así que sin ese argumento el
# build falla a propósito, con el mensaje de `src/infraestructura/version.ts`
# (ADR 0005). Una imagen que no sabe qué versión es no se despliega.
#
# Se construye y se prueba con `npm run imagen` y `npm run imagen:prueba`
# (`scripts/imagen.ts`), que es lo que corre CI y lo que está en el RUNBOOK.
#
# Solo x86_64 (contrato de portabilidad). Multi-arch sería, con buildx y
# empujando al registro en el mismo comando (`--load` no acepta dos
# plataformas):
#   docker buildx build --platform linux/amd64,linux/arm64 --push --tag <etiqueta> .

# Base fijada por digest, como las acciones de CI (ADR 0006): un tag se mueve,
# un digest no. Dependabot (ecosistema `docker`) propone las subidas.
FROM node:24.16.0-alpine3.22@sha256:191c9f0080fcbbc6547a85dc0ff7988072214a355aabdc1d2ec55a7dae5eea8a AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencias aparte del código: mientras `package-lock.json` no cambie, esta
# capa se reusa y `npm ci` no se vuelve a correr.
# `npm ci` corre `postinstall` = `prisma generate` (F0-08, ADR 0008), que lee
# el esquema y `prisma.config.ts`: entran acá, antes del resto del código. No
# se conecta a ninguna base.
FROM base AS dependencias
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

FROM dependencias AS construccion
COPY . .
# Sin valor por defecto: si no viene, el build falla al resolver la versión.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
RUN npm run build

FROM base AS final
ENV NODE_ENV=production

# El usuario `node` (uid 1000) ya viene en la imagen oficial. Los archivos
# quedan de root: el proceso los lee, no los escribe.
COPY --from=construccion /app/.next/standalone ./
COPY --from=construccion /app/.next/static ./.next/static
# No hay `public/` todavía; cuando exista, se copia acá y `server.js` la sirve.

USER node

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# El latido público de P13, que es también el del deploy. Sin curl ni wget:
# `fetch` viene en Node 24.
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/salud').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# La misma imagen sirve para app y worker: el comando de arranque elige cuál.
# Hoy solo existe la app. El worker (F0-25) va a correr con esta misma imagen
# sobrescribiendo el comando (`docker run <imagen> node <su-entrada>.js`), sin
# `ENTRYPOINT` fijo y sin una imagen aparte.
CMD ["node", "server.js"]
