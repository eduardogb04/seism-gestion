/**
 * Tipos de servicio (F1-07), humo en un navegador de verdad contra la imagen
 * que se publica. Un administrador
 *
 * 1. ve los cinco tipos de la semilla, con su modalidad;
 * 2. da de alta uno: «Activo» viene marcado; con un nombre repetido la ventana
 *    vuelve con el mensaje al lado y lo escrito;
 * 3. lo edita desmarcando «Activo» y lo ve en *No* en el listado;
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

test("un administrador da de alta un tipo de servicio, lo edita para dejarlo inactivo y lo da de baja; un nombre repetido vuelve con lo escrito", async ({
  page,
}) => {
  await entrarComoAdmin(page);
  await page.goto("/catalogo/tipos-de-servicio");

  // 1. El menú y la semilla.
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(
    menu.getByRole("link", { name: "Tipos de servicio" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(fila(page, "Auditoría de tanques")).toContainText("Puntual");
  await expect(fila(page, "Logística")).toContainText("Puntual");
  await expect(fila(page, "Certificación de camiones")).toContainText(
    "Puntual",
  );
  await expect(fila(page, "Informes")).toContainText("Puntual");
  await expect(fila(page, "Servicio de operación / alquiler")).toContainText(
    "Recurrente",
  );
  await expect(fila(page, "Servicio de operación / alquiler")).toContainText(
    "Sí",
  );

  // 2. Alta: «Activo» viene marcado. Un nombre repetido vuelve con lo escrito.
  await page.getByRole("link", { name: "Alta de tipo de servicio" }).click();
  const ventana = page.getByRole("dialog", {
    name: "Alta de tipo de servicio",
  });
  await expect(ventana).toBeVisible();
  await expect(campo(page, "Activo")).toBeChecked();
  await campo(page, "Nombre").fill("logística");
  await campo(page, "Descripción").fill("Otra descripción");
  await campo(page, "Modalidad por defecto").selectOption({
    label: "Recurrente",
  });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana.locator("[data-error-de-campo]")).toHaveText(/DOM-0008/);
  await expect(campo(page, "Nombre")).toHaveValue("logística");
  await expect(campo(page, "Descripción")).toHaveValue("Otra descripción");
  await expect(campo(page, "Modalidad por defecto")).toHaveValue("recurrente");
  await expect(campo(page, "Activo")).toBeChecked();

  // Con otro nombre, da de alta.
  await campo(page, "Nombre").fill("Capacitación de operarios");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Capacitación de operarios")).toContainText(
    "Recurrente",
  );
  await expect(fila(page, "Capacitación de operarios")).toContainText("Sí");

  // 3. Edición: desmarca «Activo» y el listado lo muestra en No.
  await fila(page, "Capacitación de operarios")
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(campo(page, "Activo")).toBeChecked();
  await campo(page, "Activo").uncheck();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Capacitación de operarios")).toContainText("No");

  // 4. Baja, con su confirmación.
  await fila(page, "Capacitación de operarios")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Baja de tipo de servicio" }),
  ).toContainText("Capacitación de operarios");
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Capacitación de operarios")).toHaveCount(0);
  await expect(fila(page, "Informes")).toBeVisible();
});
