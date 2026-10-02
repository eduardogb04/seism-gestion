/**
 * Camiones (F1-06), en un navegador de verdad contra la imagen que se publica.
 * Humo: un administrador
 *
 * 1. ve los camiones de la semilla y, en el alta, un selector de cliente que
 *    invita a elegir;
 * 2. da de alta un semi con cisterna sin los datos de la cisterna: la ventana
 *    vuelve con un mensaje al lado de cada uno y lo escrito;
 * 3. los completa y ve el camión en el listado, con la patente normalizada y
 *    la antigüedad de la cisterna;
 * 4. cambia la capacidad;
 * 5. lo da de baja.
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

test("un administrador da de alta un semi con cisterna, ve su antigüedad, cambia su capacidad y lo da de baja", async ({
  page,
}) => {
  await entrarComoAdmin(page);
  await page.goto("/catalogo/camiones");

  // 1. El menú, la semilla y el selector obligatorio.
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(menu.getByRole("link", { name: "Camiones" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(fila(page, "ZZ001ZZ")).toContainText("Empresa Ejemplo Uno S.A.");
  await expect(fila(page, "ZZ001ZZ")).toContainText("Semi con cisterna");

  await page.getByRole("link", { name: "Alta de camión" }).click();
  const ventana = page.getByRole("dialog", { name: "Alta de camión" });
  await expect(ventana).toBeVisible();
  await expect(campo(page, "Cliente").locator("option:checked")).toHaveText(
    "Elegí…",
  );

  // 2. Semi con cisterna sin cisterna: un mensaje al lado de cada dato, y lo
  // escrito sigue.
  await campo(page, "Cliente").selectOption({
    label: "Empresa Ejemplo Uno S.A.",
  });
  await campo(page, "Tipo").selectOption({ label: "Semi con cisterna" });
  await campo(page, "Patente del tractor").fill("zz 900-zz");
  await campo(page, "Marca del tractor").fill("Marca Ejemplo");
  await campo(page, "Año de fabricación del tractor").fill("2019");
  await campo(page, "Capacidad (litros)").fill("25000");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana.locator("[data-error-de-campo]")).toHaveText([
    "Escribí la patente de la cisterna.",
    "Escribí la marca de la cisterna.",
    "Escribí el año de fabricación de la cisterna.",
  ]);
  await expect(campo(page, "Patente del tractor")).toHaveValue("zz 900-zz");
  await expect(campo(page, "Capacidad (litros)")).toHaveValue("25000");

  // 3. Completo: la patente se guarda normalizada y la antigüedad es la de la
  // cisterna (el año del reloj de la app, que acá es el de la máquina).
  const anioCisterna = new Date().getUTCFullYear() - 3;
  await campo(page, "Patente de la cisterna").fill("zz 901 zz");
  await campo(page, "Marca de la cisterna").fill("Marca Ejemplo");
  await campo(page, "Año de fabricación de la cisterna").fill(
    String(anioCisterna),
  );
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "ZZ900ZZ")).toContainText("ZZ901ZZ");
  await expect(fila(page, "ZZ900ZZ")).toContainText("3 años");

  // 4. Edición.
  await fila(page, "ZZ900ZZ").getByRole("link", { name: "Editar" }).click();
  await campo(page, "Capacidad (litros)").fill("26000");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "ZZ900ZZ")).toContainText("26.000");

  // 5. Baja, con su confirmación.
  await fila(page, "ZZ900ZZ")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Baja de camión" }),
  ).toContainText("ZZ900ZZ");
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "ZZ900ZZ")).toHaveCount(0);
  await expect(fila(page, "ZZ001ZZ")).toBeVisible();
});
