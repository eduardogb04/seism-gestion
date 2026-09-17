# tests/e2e

Camino de humo con Playwright (Chromium) contra la app levantada con compose.
Desde F0-14.

    npm run test:e2e

No lo corre Vitest: lo corre Playwright con `playwright.config.ts` (por qué,
en `docs/adr/0014-niveles-de-test.md`). El `webServer` levanta el servicio
`app` del perfil `e2e` de `docker-compose.yml` —la **imagen que se publica**,
no `next dev`— con `npm run e2e:app`, y `_arnes/apagar-app.ts` la apaga al
terminar, sin tocar el Postgres de compose ni su volumen.

Necesita Docker corriendo y el navegador instalado una vez
(`npx playwright install chromium`, RUNBOOK sección 16).

- `humo.spec.ts`: abre `/`, ve el texto de la página de inicio, pide
  `/api/salud` y ve `ok: true`.
