/**
 * Cuentas (F2-02), humo en un navegador de verdad contra la imagen que se
 * publica. Un administrador
 *
 * 1. ve las cuatro cuentas de la semilla, con su tipo y su moneda;
 * 2. da de alta una: «Activa» viene marcada; con un nombre repetido la ventana
 *    vuelve con el mensaje al lado y lo escrito;
 * 3. la edita desmarcando «Activa» y la ve en *No* en el listado;
 * 4. la da de baja.
 *
 * Todo inventado.
 */

import { expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";

async function entrarComoAdmin(page: Page): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: ADMIN }).click();
  await expect(page).toHaveURL(/\/sesion$/);
}

function fila(page: Page, texto: string) {
  return page.getByRole("row", { name: new RegExp(texto) });
}

function campo(page: Page, etiqueta: string) {
  return page.getByLabel(etiqueta, { exact: true });
}

test("un administrador da de alta una cuenta, la edita para dejarla inactiva y la da de baja; un nombre repetido vuelve con lo escrito", async ({
  page,
}) => {
  await entrarComoAdmin(page);
  await page.goto("/catalogo/cuentas");

  // 1. El menú y la semilla.
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(menu.getByRole("link", { name: "Cuentas" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    fila(page, "Banco Ejemplo Uno — cuenta corriente"),
  ).toContainText("Pesos");
  await expect(
    fila(page, "Banco Ejemplo Dos — cuenta corriente"),
  ).toContainText("Banco");
  await expect(fila(page, "Banco Ejemplo Uno — dólares")).toContainText(
    "Dólares",
  );
  await expect(fila(page, "Caja")).toContainText("Efectivo");
  await expect(fila(page, "Caja")).toContainText("Sí");

  // 2. Alta: «Activa» viene marcada. Un nombre repetido vuelve con lo escrito.
  await page.getByRole("link", { name: "Alta de cuenta" }).click();
  const ventana = page.getByRole("dialog", { name: "Alta de cuenta" });
  await expect(ventana).toBeVisible();
  await expect(campo(page, "Activa")).toBeChecked();
  await campo(page, "Nombre").fill("caja");
  await campo(page, "Tipo").selectOption({ label: "Efectivo" });
  await campo(page, "Moneda").selectOption({ label: "Dólares" });
  await campo(page, "Observaciones").fill("Otra observación");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana.locator("[data-error-de-campo]")).toHaveText(/DOM-0008/);
  await expect(campo(page, "Nombre")).toHaveValue("caja");
  await expect(campo(page, "Moneda")).toHaveValue("USD");
  await expect(campo(page, "Observaciones")).toHaveValue("Otra observación");
  await expect(campo(page, "Activa")).toBeChecked();

  // Con otro nombre, da de alta.
  await campo(page, "Nombre").fill("Caja chica en dólares");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Caja chica en dólares")).toContainText("Dólares");
  await expect(fila(page, "Caja chica en dólares")).toContainText("Sí");

  // 3. Edición: desmarca «Activa» y el listado la muestra en No.
  await fila(page, "Caja chica en dólares")
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(campo(page, "Activa")).toBeChecked();
  await campo(page, "Activa").uncheck();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Caja chica en dólares")).toContainText("No");

  // 4. Baja, con su confirmación.
  await fila(page, "Caja chica en dólares")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Baja de cuenta" }),
  ).toContainText("Caja chica en dólares");
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Caja chica en dólares")).toHaveCount(0);
  await expect(fila(page, "Caja")).toBeVisible();
});
