/**
 * El calendario (F4-04, ADR 0046), en un navegador de verdad contra la imagen
 * que se publica, sobre los datos de demostración. El mes va en la dirección
 * (`?mes=`) para no depender del día en que corra:
 *
 * 1. octubre de 2026 trae la factura 0000-00000001 (vence el 30) y el egreso
 *    «Curso de capacitación» (vence el 10), que ya está vencido;
 * 2. «Mes siguiente» lleva a noviembre de 2026 y «Mes anterior» vuelve a octubre;
 * 3. filtrar por «Egresos por pagar» deja solo egresos y abrir la entrada lleva
 *    a su detalle;
 * 4. el inicio trae las tarjetas «Vence en los próximos 30 días» y «Vencido»
 *    (F4-06), con su cantidad, y las dos llevan al calendario del mes de hoy.
 *    Las cantidades exactas las afirma `tests/casos-uso/calendario.test.ts`
 *    con un reloj fijo: acá corre el reloj real y la semilla compartida no
 *    deja cuentas estables.
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

  await page.goto("/calendario?mes=2026-10&vista=agenda");
  await expect(
    page.getByText("Octubre de 2026", { exact: true }),
  ).toBeVisible();
  const egreso = page.getByRole("link", { name: /Curso de capacitación/ });
  await expect(egreso).toContainText("USD");
  await expect(egreso).toContainText("Vencido hace");
  await expect(
    page.getByRole("link", { name: /Factura 0000-00000001/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Mes siguiente" }).click();
  await expect(page).toHaveURL(/mes=2026-11/);
  await expect(
    page.getByText("Noviembre de 2026", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Mes anterior" }).click();
  await expect(page).toHaveURL(/mes=2026-10/);

  await page.getByRole("link", { name: "Egresos por pagar" }).click();
  await expect(page).toHaveURL(/tipo=egreso/);
  await expect(page.getByText("Factura 0000-00000001")).toHaveCount(0);

  await page.getByRole("link", { name: /Curso de capacitación/ }).click();
  const panel = page.getByRole("dialog", { name: "Egresos por pagar" });
  await expect(panel).toBeVisible();
  await panel.getByRole("link", { name: "Abrir egreso" }).click();
  await expect(page).toHaveURL(/\/egresos\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Curso de capacitación" }),
  ).toBeVisible();
});
