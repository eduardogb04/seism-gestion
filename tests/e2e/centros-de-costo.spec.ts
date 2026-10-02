/**
 * Centros de costo (F2-01), humo en un navegador de verdad contra la imagen
 * que se publica. Un administrador
 *
 * 1. ve los cinco centros de la semilla, con su clase;
 * 2. da de alta uno: con un nombre repetido la ventana vuelve con el mensaje
 *    al lado y lo escrito;
 * 3. lo edita cambiándole la clase;
 * 4. lo da de baja.
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

test("un administrador da de alta un centro de costo, le cambia la clase y lo da de baja; un nombre repetido vuelve con lo escrito", async ({
  page,
}) => {
  await entrarComoAdmin(page);
  await page.goto("/catalogo/centros-de-costo");

  // 1. El menú y la semilla.
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(
    menu.getByRole("link", { name: "Centros de costo" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(fila(page, "Servicios a clientes")).toContainText("Proyecto");
  await expect(fila(page, "Administración")).toContainText(
    "Gestión administrativa",
  );
  await expect(fila(page, "Vehículos")).toContainText("Gestión administrativa");
  await expect(fila(page, "Capacitaciones")).toContainText(
    "Fuera de rentabilidad",
  );
  await expect(fila(page, "Compra de activos")).toContainText(
    "Fuera de rentabilidad",
  );

  // 2. Alta: un nombre repetido vuelve con lo escrito.
  await page.getByRole("link", { name: "Alta de centro de costo" }).click();
  const ventana = page.getByRole("dialog", { name: "Alta de centro de costo" });
  await expect(ventana).toBeVisible();
  await expect(campo(page, "Activo")).toBeChecked();
  await campo(page, "Nombre").fill("administración");
  await campo(page, "Clase").selectOption({ label: "Proyecto" });
  await campo(page, "Descripción").fill("Otra descripción");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana.locator("[data-error-de-campo]")).toHaveText(/DOM-0008/);
  await expect(campo(page, "Nombre")).toHaveValue("administración");
  await expect(campo(page, "Clase")).toHaveValue("proyecto");
  await expect(campo(page, "Descripción")).toHaveValue("Otra descripción");

  // Con otro nombre, da de alta.
  await campo(page, "Nombre").fill("Viáticos");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Viáticos")).toContainText("Proyecto");

  // 3. Edición: cambia la clase.
  await fila(page, "Viáticos").getByRole("link", { name: "Editar" }).click();
  await campo(page, "Clase").selectOption({ label: "Fuera de rentabilidad" });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Viáticos")).toContainText("Fuera de rentabilidad");

  // 4. Baja, con su confirmación.
  await fila(page, "Viáticos")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Baja de centro de costo" }),
  ).toContainText("Viáticos");
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Viáticos")).toHaveCount(0);
  await expect(fila(page, "Vehículos")).toBeVisible();
});
