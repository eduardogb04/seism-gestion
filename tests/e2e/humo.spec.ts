/**
 * El camino de humo del e2e (F0-14): la app levantada con compose —la misma
 * imagen que se publica— abre la página de inicio en un navegador de verdad y
 * responde el latido.
 *
 * Es lo que hasta ahora se verificaba a mano en cada PR (F0-04) y con
 * `npm run imagen:prueba` sin navegador: acá lo hace Chromium, en CI, en cada
 * cambio.
 *
 * Los caminos de negocio llegan cuando haya negocio (lote 8 en adelante).
 */

import { expect, test } from "@playwright/test";

test("la app levantada muestra la página de inicio y responde el latido", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByText("SeisM · gestión · fase 0")).toBeVisible();

  const latido = await request.get("/api/salud");
  expect(latido.ok()).toBe(true);

  const cuerpo: unknown = await latido.json();
  expect(cuerpo).toEqual({ ok: true, version: expect.any(String) });
});
