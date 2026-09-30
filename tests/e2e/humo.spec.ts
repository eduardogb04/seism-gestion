/**
 * El camino de humo del e2e (F0-14, F0-26): la app levantada con compose —la
 * misma imagen que se publica— abre la página de inicio en un navegador de
 * verdad, responde el latido y muestra el panel de salud (`/salud`) a un
 * administrador.
 *
 * Es lo que hasta ahora se verificaba a mano en cada PR (F0-04) y con
 * `npm run imagen:prueba` sin navegador: acá lo hace Chromium, en CI, en cada
 * cambio.
 *
 * `/salud` es del administrador (F0-32): sin sesión no muestra el panel. El
 * e2e no levanta el worker, así que el `latido` puede estar en rojo ("nunca
 * corrió") y el test lo acepta; lo que sí tiene que estar en verde es la
 * integración `base`. Con JavaScript apagado el panel se ve igual: es HTML del
 * servidor. Todo inventado (`@ejemplo.test`).
 *
 * Los caminos de negocio llegan cuando haya negocio (lote 8 en adelante).
 */

import { expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";

const SECCIONES = [
  "Jobs",
  "Fallidos pendientes",
  "Integraciones",
  "Gasto de IA del mes",
];

/** Entra con la identidad falsa como `email` y termina en la página de la sesión. */
async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: email }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(email);
}

async function verElPanel(page: Page): Promise<void> {
  await page.goto("/salud");
  await expect(page.getByRole("heading", { name: "Salud" })).toBeVisible();
  for (const titulo of SECCIONES) {
    await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
  }
  await expect(page.locator('[data-integracion="base"]')).toHaveAttribute(
    "data-estado",
    "ok",
  );
  await expect(page.locator('[data-job="latido"]')).toHaveCount(1);
}

test("la app levantada muestra la página de inicio, responde el latido y el administrador ve el panel de salud", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByText("SeisM · gestión · fase 0")).toBeVisible();

  const latido = await request.get("/api/salud");
  expect(latido.ok()).toBe(true);

  const cuerpo: unknown = await latido.json();
  expect(cuerpo).toEqual({ ok: true, version: expect.any(String) });

  await entrarComo(page, ADMIN);
  await verElPanel(page);
});

test("sin sesión, /salud no muestra el panel", async ({ page }) => {
  await page.goto("/salud");

  await expect(page).toHaveURL(/\/ingresar\/error\?codigo=AUT-0002/);
  await expect(page.getByRole("heading", { name: "Jobs" })).toHaveCount(0);
  await expect(page.locator("[data-job]")).toHaveCount(0);
});

test.describe("con JavaScript apagado", () => {
  test.use({ javaScriptEnabled: false });

  test("el panel se ve igual: el latido y la sección de fallidos están", async ({
    page,
  }) => {
    await entrarComo(page, ADMIN);
    await verElPanel(page);

    await expect(page.locator('[data-job="latido"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Fallidos pendientes" }),
    ).toBeVisible();
  });
});
