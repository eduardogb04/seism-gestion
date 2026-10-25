/**
 * El selector de moneda del inicio sobre los datos de demostración, con los
 * valores exactos de octubre de 2026 (F3-08, ADR 0042).
 *
 * El nombre empieza con `00-` a propósito: Playwright corre los archivos por
 * orden alfabético y de a uno, y los recorridos de cobros, facturas y egresos
 * cargan documentos en octubre de 2026. Este es el único que afirma la semilla
 * pelada, así que tiene que correr antes que todos.
 */

import { expect, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";

test("la facturación y lo cobrado de octubre de 2026 cambian de moneda con el selector, con los valores de la semilla", async ({
  page,
}) => {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: ADMIN }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  // Octubre de 2026 en la semilla: una factura en pesos de 250.000,00 sin IVA y otra en dólares de
  // 10.000,00 a 1.200,00; cobros de 200.000,00 más 8.000,00 de retención sobre la de pesos y de
  // 5.000,00 dólares sobre la otra. En pesos, lo de dólares se multiplica por 1.200,00; en dólares,
  // lo de pesos se divide por el último tipo de cambio cargado (1.200,00).
  await page.goto("/?mes=2026-10");
  await expect(page.locator('[data-kpi="facturacion"]')).toHaveText(
    "ARS 12.250.000,00",
  );
  await expect(page.locator('[data-kpi="cobrado"]')).toHaveText(
    "ARS 6.208.000,00",
  );

  await page.locator('[data-selector-moneda="USD"]').click();

  await expect(page.locator('[data-kpi="facturacion"]')).toHaveText(
    "USD 10.208,33",
  );
  await expect(page.locator('[data-kpi="cobrado"]')).toHaveText("USD 5.173,33");
});
