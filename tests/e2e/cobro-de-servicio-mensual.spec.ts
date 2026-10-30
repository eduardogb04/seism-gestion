/**
 * La ventana de cobro de un servicio mensual muestra, además de lo que falta
 * cobrar, lo devengado a la fecha (F3-07, F3-03). Sobre el servicio mensual de
 * la semilla: se carga la factura del mes con lo que propone el formulario y
 * se abre su cobro. Todo inventado.
 */

import { expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const TITULO = "Alquiler mensual de tanques — ejemplo";

async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: email }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(email);
}

test("cobrar una factura de un servicio mensual muestra lo devengado a la fecha", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);

  await page.goto("/servicios");
  await page
    .getByRole("row", { name: new RegExp(TITULO) })
    .getByRole("link")
    .first()
    .click();
  await page.getByRole("link", { name: "Emitir factura" }).click();
  const nueva = page.getByRole("dialog", { name: "Nueva factura" });
  await nueva.getByLabel("Número").fill(`0000-MEN-${Date.now()}`);
  await nueva.getByLabel("Vencimiento").fill("2026-11-30");
  await nueva.getByRole("button", { name: "Cargar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Lo devengado que ya muestra la tarjeta de Facturación es lo que repite la ventana.
  const devengado = (
    await page
      .locator("[data-numeros-de-facturacion] article")
      .filter({ has: page.getByRole("heading", { name: /^Devengado a/ }) })
      .locator("p")
      .first()
      .innerText()
  ).trim();
  expect(devengado).toMatch(/^ARS [0-9.]+,[0-9]{2}$/);

  await page
    .getByRole("link", { name: "Registrar cobro", exact: true })
    .click();
  const cobro = page.getByRole("dialog", { name: "Cobrar factura" });
  await expect(cobro.locator("[data-devengado]")).toContainText("Devengado a");
  await expect(cobro.locator("[data-devengado]")).toContainText(devengado);
});
