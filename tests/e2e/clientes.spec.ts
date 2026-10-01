/**
 * Clientes y proveedores (F1-04), el segundo ABM del molde, en un navegador de
 * verdad contra la imagen que se publica. Humo: un administrador
 *
 * 1. ve los clientes de la semilla, con el CUIT con guiones, el grupo y el tipo;
 * 2. da de alta uno eligiendo el grupo en el selector: con un CUIT inválido la
 *    ventana vuelve con el mensaje al lado del campo y lo escrito;
 * 3. lo edita, y lo da de baja;
 * 4. no puede dar de baja el grupo que un cliente usa: la ventana de baja del
 *    grupo muestra el error.
 *
 * Todo inventado: los CUIT tienen cuerpo `30-0000000x` y dígito calculado.
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

test("un administrador da de alta un cliente con grupo, lo edita y lo da de baja; el grupo en uso no se puede dar de baja", async ({
  page,
}) => {
  await entrarComoAdmin(page);
  await page.goto("/catalogo/clientes");

  // 1. El menú y la semilla: CUIT con formato, grupo y tipo.
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(
    menu.getByRole("link", { name: "Clientes y proveedores" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(fila(page, "Empresa Ejemplo Uno S.A.")).toContainText(
    "30-00000001-5",
  );
  await expect(fila(page, "Empresa Ejemplo Uno S.A.")).toContainText(
    "Grupo Norte",
  );
  await expect(fila(page, "Servicios Ejemplo Tres S.A.")).toContainText(
    "Cliente y proveedor",
  );
  await expect(fila(page, "Proveedora Ejemplo Cinco S.A.")).toContainText(
    "Proveedor",
  );

  // 2. Alta con un CUIT inválido: el mensaje queda al lado y lo escrito sigue.
  await page.getByRole("link", { name: "Alta de cliente o proveedor" }).click();
  const ventana = page.getByRole("dialog", {
    name: "Alta de cliente o proveedor",
  });
  await expect(ventana).toBeVisible();
  await campo(page, "Razón social").fill("Empresa Ejemplo Seis S.A.");
  await campo(page, "CUIT").fill("30-00000006-7");
  await campo(page, "Condición frente al IVA").selectOption({
    label: "Monotributo",
  });
  await campo(page, "Calle y número").fill("Avenida Inventada 456");
  await campo(page, "Localidad").fill("Villa Ejemplo");
  await campo(page, "Provincia").selectOption({ label: "Mendoza" });
  await campo(page, "Código postal").fill("m5500");
  await campo(page, "Grupo").selectOption({ label: "Grupo Sur" });
  await campo(page, "Es cliente").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana.locator("[data-error-de-campo]")).toHaveText(
    /El CUIT no es válido/,
  );
  await expect(campo(page, "CUIT")).toHaveAccessibleDescription(
    /El CUIT no es válido/,
  );
  await expect(campo(page, "CUIT")).toHaveValue("30-00000006-7");
  await expect(campo(page, "Razón social")).toHaveValue(
    "Empresa Ejemplo Seis S.A.",
  );
  await expect(campo(page, "Condición frente al IVA")).toHaveValue(
    "monotributo",
  );
  await expect(campo(page, "Provincia")).toHaveValue("mendoza");
  await expect(campo(page, "Grupo").locator("option:checked")).toHaveText(
    "Grupo Sur",
  );
  await expect(campo(page, "Es cliente")).toBeChecked();

  // Corregido, da de alta: el listado muestra el CUIT con guiones y el grupo.
  await campo(page, "CUIT").fill("30000000066");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Empresa Ejemplo Seis S.A.")).toContainText(
    "30-00000006-6",
  );
  await expect(fila(page, "Empresa Ejemplo Seis S.A.")).toContainText(
    "Monotributo",
  );
  await expect(fila(page, "Empresa Ejemplo Seis S.A.")).toContainText(
    "Grupo Sur",
  );

  // 3. Edición: el formulario trae lo guardado (el CUIT con guiones) y cambia.
  await fila(page, "Empresa Ejemplo Seis S.A.")
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(campo(page, "CUIT")).toHaveValue("30-00000006-6");
  await expect(campo(page, "Código postal")).toHaveValue("M5500");
  await expect(campo(page, "Grupo")).toHaveText(/Grupo Sur/);
  await campo(page, "Razón social").fill("Empresa Ejemplo Siete S.A.");
  await campo(page, "Es proveedor").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Empresa Ejemplo Siete S.A.")).toContainText(
    "Cliente y proveedor",
  );
  await expect(fila(page, "Empresa Ejemplo Seis S.A.")).toHaveCount(0);

  // 4. El grupo que el cliente usa no se puede dar de baja.
  await page.goto("/catalogo/grupos");
  await fila(page, "Grupo Sur")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Baja de grupo" })
      .locator("[data-codigo-error]"),
  ).toHaveText(/DOM-0010/);
  await page.goto("/catalogo/grupos");
  await expect(fila(page, "Grupo Sur")).toBeVisible();

  // Baja del cliente, con su confirmación.
  await page.goto("/catalogo/clientes");
  await fila(page, "Empresa Ejemplo Siete S.A.")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  const baja = page.getByRole("dialog", {
    name: "Baja de cliente o proveedor",
  });
  await expect(baja).toContainText("Empresa Ejemplo Siete S.A.");
  await expect(baja).toContainText("30-00000006-6");
  await expect(baja).toContainText("Grupo Sur");
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, "Empresa Ejemplo Siete S.A.")).toHaveCount(0);
  await expect(fila(page, "Empresa Ejemplo Uno S.A.")).toBeVisible();
});
