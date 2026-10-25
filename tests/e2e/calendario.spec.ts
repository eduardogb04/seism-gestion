/**
 * El calendario (F4-04, ADR 0046), en un navegador de verdad contra la imagen
 * que se publica, sobre los datos de demostración. El mes va en la dirección
 * (`?mes=`) para no depender del día en que corra:
 *
 * 1. octubre de 2026 trae la factura 0000-00000001 (vence el 30) y el egreso
 *    «Curso de capacitación» (vence el 10), que ya está vencido;
 * 2. «Mes siguiente» lleva a noviembre de 2026, con la factura 0000-00000002
 *    y sin el egreso, y «Mes anterior» vuelve a octubre;
 * 3. filtrar por «Egresos por pagar» deja solo egresos y abrir la entrada lleva
 *    a su detalle.
 *
 * Todo inventado (`@ejemplo.test`).
 */

import { expect, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";

test("navega entre meses, filtra por tipo y abre una entrada", async ({
  page,
}) => {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: ADMIN }).click();
  await expect(page).toHaveURL(/\/sesion$/);

  await page.goto("/calendario?mes=2026-10");
  await expect(
    page.getByText("octubre de 2026", { exact: true }),
  ).toBeVisible();
  const lista = page.getByRole("table").last();
  const factura = lista.getByRole("row").filter({
    hasText: "Factura 0000-00000001",
  });
  await expect(factura).toBeVisible();
  const egreso = lista.getByRole("row").filter({
    hasText: "Curso de capacitación",
  });
  await expect(egreso).toContainText("USD 500,00");
  await expect(egreso).toContainText("Vencido");

  await page.getByRole("link", { name: "Mes siguiente" }).click();
  await expect(page).toHaveURL(/mes=2026-11/);
  await expect(
    page.getByText("noviembre de 2026", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Factura 0000-00000002" }),
  ).not.toHaveCount(0);
  await expect(page.getByText("Curso de capacitación")).toHaveCount(0);

  await page.getByRole("link", { name: "Mes anterior" }).click();
  await expect(page).toHaveURL(/mes=2026-10/);

  await page.getByLabel("Egresos por pagar").check();
  await page.getByLabel("Facturas por cobrar").uncheck();
  await page.getByLabel("Vencimientos").uncheck();
  await page.getByLabel("Inicios estimados").uncheck();
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/tipo=egreso/);
  await expect(page.getByText("Factura 0000-00000001")).toHaveCount(0);

  await page
    .getByRole("table")
    .last()
    .getByRole("link", { name: "Curso de capacitación" })
    .click();
  await expect(page).toHaveURL(/\/egresos\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Curso de capacitación" }),
  ).toBeVisible();
});
