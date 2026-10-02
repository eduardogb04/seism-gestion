/**
 * Sitios (F1-05), en un navegador de verdad contra la imagen que se publica.
 * Humo: un administrador
 *
 * 1. ve los sitios de la semilla, con el cliente y los números con miles;
 * 2. da de alta uno eligiendo el cliente en el selector: sin cliente y con una
 *    cantidad que no es un número, la ventana vuelve con los mensajes al lado
 *    de cada campo y lo escrito;
 * 3. cambia la cantidad de tanques, abre de nuevo la edición y ve el cambio en
 *    la tabla *Cambios* (fecha, quién, de cuánto a cuánto);
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

test("un administrador da de alta un sitio, cambia su cantidad de tanques y ve el cambio en el historial; después lo da de baja", async ({
  page,
}) => {
  await entrarComoAdmin(page);
  await page.goto("/catalogo/sitios");

  // 1. El menú y la semilla: cliente y números con separador de miles.
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(menu.getByRole("link", { name: "Sitios" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(fila(page, "Planta Ejemplo Norte")).toContainText(
    "Empresa Ejemplo Uno S.A.",
  );
  await expect(fila(page, "Planta Ejemplo Norte")).toContainText("120.000");

  // 2. Alta sin cliente y con una cantidad inválida: los mensajes quedan al
  // lado de su campo y lo escrito sigue.
  await page.getByRole("link", { name: "Alta de sitio" }).click();
  const ventana = page.getByRole("dialog", { name: "Alta de sitio" });
  await expect(ventana).toBeVisible();
  await campo(page, "Nombre").fill("Sitio de Humo Ejemplo");
  await campo(page, "Provincia").selectOption({ label: "Mendoza" });
  await campo(page, "Localidad").fill("Villa Ejemplo");
  await campo(page, "Cantidad de tanques").fill("12abc");
  await campo(page, "Capacidad total (litros)").fill("15000");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana.locator("[data-error-de-campo]")).toHaveText([
    "Elegí un cliente.",
    "Escribí un número.",
  ]);
  await expect(campo(page, "Cantidad de tanques")).toHaveValue("12abc");
  await expect(campo(page, "Nombre")).toHaveValue("Sitio de Humo Ejemplo");

  // Corregido, da de alta.
  await campo(page, "Cliente").selectOption({
    label: "Empresa Ejemplo Uno S.A.",
  });
  await campo(page, "Cantidad de tanques").fill("2");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Sitio de Humo Ejemplo")).toContainText(
    "Empresa Ejemplo Uno S.A.",
  );
  await expect(fila(page, "Sitio de Humo Ejemplo")).toContainText("15.000");

  // 3. Cambia la cantidad; al abrir de nuevo la edición, el cambio está en *Cambios*.
  await fila(page, "Sitio de Humo Ejemplo")
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(page.getByRole("heading", { name: "Cambios" })).toHaveCount(0);
  await campo(page, "Cantidad de tanques").fill("3");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await fila(page, "Sitio de Humo Ejemplo")
    .getByRole("link", { name: "Editar" })
    .click();
  const edicion = page.getByRole("dialog", { name: "Edición de sitio" });
  await expect(campo(page, "Cantidad de tanques")).toHaveValue("3");
  await expect(edicion.getByRole("heading", { name: "Cambios" })).toBeVisible();
  await expect(
    edicion.getByRole("row", { name: /Cantidad de tanques/ }).getByRole("cell"),
  ).toHaveText([
    /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/,
    ADMIN,
    "Cantidad de tanques",
    "2",
    "3",
  ]);
  await edicion.getByRole("link", { name: "Cancelar" }).click();

  // 4. Baja, con su confirmación.
  await fila(page, "Sitio de Humo Ejemplo")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  const baja = page.getByRole("dialog", { name: "Baja de sitio" });
  await expect(baja).toContainText("Sitio de Humo Ejemplo");
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Sitio de Humo Ejemplo")).toHaveCount(0);
  await expect(fila(page, "Planta Ejemplo Norte")).toBeVisible();
});
