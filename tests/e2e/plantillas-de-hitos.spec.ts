/**
 * Plantillas de hitos (F6-02), humo en un navegador de verdad contra la imagen
 * que se publica. Un administrador
 *
 * 1. da de alta una plantilla con tres hitos y, en el mismo formulario, sube el
 *    tercero un lugar: el listado cuenta tres hitos y al editarla vuelven en
 *    ese orden;
 * 2. la aplica a un servicio «Adjudicado» (con su cotización y su orden de
 *    compra): los hitos aparecen al final, en el orden de la plantilla, y uno
 *    se sube y otro se quita.
 *
 * Todo inventado.
 */

import { expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const NOMBRE = `Plantilla de prueba ${Date.now()}`;
const TITULO = "Plantilla aplicada de prueba — ejemplo";

async function entrarComoAdmin(page: Page): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: ADMIN }).click();
  await expect(page).toHaveURL(/\/sesion$/);
}

function ventana(page: Page, titulo: string) {
  return page.getByRole("dialog", { name: titulo });
}

test("un administrador da de alta una plantilla con tres hitos, los reordena y la aplica a un servicio adjudicado", async ({
  page,
}) => {
  await entrarComoAdmin(page);

  // 1. Alta con tres hitos; el tercero sube un lugar.
  await page.goto("/catalogo/plantillas-de-hitos");
  await expect(
    page
      .getByRole("navigation", { name: "Secciones" })
      .getByRole("link", { name: "Plantillas de hitos" }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Alta de plantilla de hitos" }).click();
  const alta = ventana(page, "Alta de plantilla de hitos");
  await alta.getByLabel("Nombre", { exact: true }).fill(NOMBRE);
  for (const [lugar, texto] of [
    "Movilización",
    "Inspección",
    "Informe",
  ].entries()) {
    await alta.getByRole("button", { name: "Agregar hito" }).click();
    await alta.getByLabel(`Hito ${lugar + 1}`, { exact: true }).fill(texto);
  }
  await alta.getByRole("button", { name: "Subir hito 3" }).click();
  await expect(alta.getByLabel("Hito 2", { exact: true })).toHaveValue(
    "Informe",
  );
  await alta.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Alta de plantilla de hitos")).toHaveCount(0);
  await expect(
    page.getByRole("row", { name: new RegExp(NOMBRE) }),
  ).toContainText("3");

  // Al editarla, los hitos vuelven en el orden guardado.
  await page
    .getByRole("row", { name: new RegExp(NOMBRE) })
    .getByRole("link", { name: "Editar" })
    .click();
  const edicion = ventana(page, "Edición de plantilla de hitos");
  await expect(edicion.getByLabel("Hito 1", { exact: true })).toHaveValue(
    "Movilización",
  );
  await expect(edicion.getByLabel("Hito 2", { exact: true })).toHaveValue(
    "Informe",
  );
  await expect(edicion.getByLabel("Hito 3", { exact: true })).toHaveValue(
    "Inspección",
  );
  await edicion.getByRole("link", { name: "Cancelar" }).click();

  // 2. Un servicio «Adjudicado» y la plantilla aplicada.
  await page.goto("/servicios");
  await page.getByRole("link", { name: "Alta de servicio" }).click();
  const servicio = ventana(page, "Alta de servicio");
  await servicio
    .getByLabel("Cliente")
    .selectOption({ label: "Empresa Ejemplo Uno S.A." });
  await servicio
    .getByLabel("Tipo de servicio")
    .selectOption({ label: "Logística" });
  await servicio.getByLabel("Título").fill(TITULO);
  await servicio.getByLabel("Responsable").selectOption({ label: ADMIN });
  await servicio.getByLabel("Fecha de pedido").fill("2026-10-10");
  await servicio.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}\/[a-z-]+$/);
  await page.getByRole("link", { name: "Cargar cotización" }).click();
  const cotizacion = ventana(page, "Nueva cotización");
  await cotizacion.getByLabel("Fecha").fill("2026-10-11");
  await cotizacion.getByLabel("Importe", { exact: true }).fill("1.000,00");
  await cotizacion.getByLabel("Documento").setInputFiles({
    name: "cotizacion.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nCotización de ejemplo\n"),
  });
  await cotizacion.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva cotización")).toHaveCount(0);
  await page.getByRole("link", { name: "Cargar orden de compra" }).click();
  const orden = ventana(page, "Nueva orden de compra");
  await orden.getByLabel("Número").fill(`OC-E2E-PLANTILLA-${Date.now()}`);
  await orden.getByLabel("Fecha").fill("2026-10-12");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva orden de compra")).toHaveCount(0);
  await expect(page.locator("[data-estado-del-servicio]")).toHaveText(
    "Adjudicado",
  );

  await page.getByLabel("Plantilla", { exact: true }).selectOption({
    label: NOMBRE,
  });
  await page.getByRole("button", { name: "Aplicar plantilla" }).click();
  const hitos = page.locator("[data-hito]");
  await expect(hitos).toHaveText([/Movilización/, /Informe/, /Inspección/]);

  // Un hito se sube y otro se quita mientras no estén realizados.
  await page
    .locator('[data-hito="Inspección"]')
    .getByRole("button", { name: "Subir" })
    .click();
  await expect(hitos).toHaveText([/Movilización/, /Inspección/, /Informe/]);
  await page
    .locator('[data-hito="Movilización"]')
    .getByRole("button", { name: "Quitar" })
    .click();
  await expect(hitos).toHaveText([/Inspección/, /Informe/]);
});
