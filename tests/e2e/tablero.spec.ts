/**
 * El inicio con el tablero (F2-10, ADR 0038), en un navegador de verdad contra
 * la imagen que se publica, sobre los datos de demostración (octubre de 2026):
 *
 * 1. entra el administrador y el inicio muestra el mes actual, con mes anterior
 *    y mes siguiente que navegan;
 * 2. en octubre de 2026 hay números de la semilla; al hacer clic en
 *    *Facturado sin IVA* se abre el listado de esas facturas, con filas, y su
 *    total es el mismo número que tenía el tablero;
 * 3. lo mismo con *Pagado*, y un mes inválido avisa y muestra el actual.
 *
 * Todo inventado (`@ejemplo.test`).
 */

import { expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";

/** Un número en cero no lleva a un listado con filas. */
const CERO = /^(ARS|USD) 0,00$/;

async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: email }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(email);
}

function mesDe(fecha: Date, desplazamiento: number): string {
  const anio = fecha.getFullYear();
  const total = anio * 12 + fecha.getMonth() + desplazamiento;
  const mes = (total % 12) + 1;
  return `${Math.floor(total / 12)}-${String(mes).padStart(2, "0")}`;
}

test("el inicio muestra el mes actual y navega al anterior y al siguiente", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  const hoy = new Date();

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  const actual = page.locator("[data-mes-actual]");
  await expect(actual).toHaveAttribute("data-mes-actual", mesDe(hoy, 0));
  await page.locator("[data-mes-anterior]").click();
  await expect(page).toHaveURL(new RegExp(`mes=${mesDe(hoy, -1)}`));
  await expect(actual).toHaveAttribute("data-mes-actual", mesDe(hoy, -1));
  await page.locator("[data-mes-siguiente]").click();
  await expect(actual).toHaveAttribute("data-mes-actual", mesDe(hoy, 0));
  await page.locator("[data-mes-siguiente]").click();
  await expect(actual).toHaveAttribute("data-mes-actual", mesDe(hoy, 1));
});

test("octubre de 2026 trae números de la semilla y cada uno lleva a un listado que suma lo mismo", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  await page.goto("/?mes=2026-10");
  await expect(page.locator("[data-mes-actual]")).toHaveAttribute(
    "data-mes-actual",
    "2026-10",
  );

  const facturado = page
    .locator('[data-cifra$="-facturado-sin-iva"]')
    .filter({ hasNotText: CERO })
    .first();
  const numeroFacturado = (await facturado.innerText()).trim();
  expect(numeroFacturado).toMatch(/^(ARS|USD) [0-9.]+,[0-9]{2}$/);
  await facturado.click();

  await expect(page).toHaveURL(/\/servicios\/facturas\?mes=2026-10&moneda=/);
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-total-sin-iva]")).toHaveText(
    `Sin IVA: ${numeroFacturado}`,
  );

  await page.goto("/?mes=2026-10");
  const pagado = page
    .locator('[data-cifra$="-pagado"]')
    .filter({ hasNotText: CERO })
    .first();
  const numeroPagado = (await pagado.innerText()).trim();
  await pagado.click();

  await expect(page).toHaveURL(/\/egresos\/pagos-hechos\?mes=2026-10&moneda=/);
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-total]")).toHaveText(
    `Total pagado: ${numeroPagado}`,
  );
});

test("un mes inválido avisa y muestra el actual", async ({ page }) => {
  await entrarComo(page, ADMIN);

  await page.goto("/?mes=2026-13");

  await expect(page.locator("[data-mes-invalido]")).toBeVisible();
  await expect(page.locator("[data-mes-actual]")).toHaveAttribute(
    "data-mes-actual",
    mesDe(new Date(), 0),
  );
});
