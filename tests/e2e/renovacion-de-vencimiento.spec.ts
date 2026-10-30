/**
 * Cotizar la renovación desde un vencimiento (F4-07), en un navegador de verdad
 * contra la imagen que se publica. Una operadora finaliza un servicio con un
 * camión y, desde su vencimiento, cotiza la renovación:
 *
 * 1. se confirma en una ventana y lleva al servicio nuevo, en «Creado», con
 *    «Renovación de <código>» de título, el camión copiado y el enlace al original;
 * 2. el vencimiento queda «Renovado» con el enlace al servicio nuevo y ya no
 *    ofrece renovarse de nuevo.
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Renovación de prueba — ejemplo";
const CODIGO = /SRV-\d{4}-\d{3}/;

async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: email }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(email);
}

async function asegurarOperadora(
  browser: Browser,
  baseURL: string | undefined,
): Promise<void> {
  const contexto = await browser.newContext(
    baseURL === undefined ? {} : { baseURL },
  );
  const admin = await contexto.newPage();
  await entrarComo(admin, ADMIN);
  await admin.goto("/administracion/usuarios");
  await expect(admin.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  if ((await admin.locator(`[data-usuario="${OPERADORA}"]`).count()) === 0) {
    await admin.getByLabel("Email").fill(OPERADORA);
    await admin.getByLabel("Rol", { exact: true }).selectOption("operador");
    await admin.getByRole("button", { name: "Dar de alta" }).click();
    await expect(admin.locator(`[data-usuario="${OPERADORA}"]`)).toBeVisible();
  }
  await contexto.close();
}

function ventana(page: Page, titulo: string) {
  return page.getByRole("dialog", { name: titulo });
}

async function confirmar(page: Page, boton: string): Promise<void> {
  await page.getByRole("link", { name: boton, exact: true }).click();
  await ventana(page, boton).getByRole("button", { name: "Confirmar" }).click();
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("desde el vencimiento de un camión se cotiza la renovación: servicio nuevo en «Creado» con el camión, y el vencimiento queda renovado con su enlace", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);

  // Un servicio de un tipo con plazo, con un camión, hasta «Finalizado».
  await page.goto("/servicios");
  await page.getByRole("link", { name: "Alta de servicio" }).click();
  const alta = ventana(page, "Alta de servicio");
  await alta
    .getByLabel("Cliente")
    .selectOption({ label: "Empresa Ejemplo Uno S.A." });
  await alta
    .getByLabel("Tipo de servicio")
    .selectOption({ label: "Certificación de camiones" });
  await alta.getByLabel("Título").fill(TITULO);
  await alta.getByLabel("Responsable").selectOption({ label: ADMIN });
  await alta.getByLabel("Fecha de pedido").fill("2026-10-10");
  await alta.getByRole("button", { name: "Guardar" }).click();
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
  await orden.getByLabel("Número").fill("OC-E2E-RENOV");
  await orden.getByLabel("Fecha").fill("2026-10-12");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva orden de compra")).toHaveCount(0);
  const estado = page.locator("[data-estado-del-servicio]");
  await expect(estado).toHaveText("Adjudicado");
  await page.getByRole("link", { name: "Nuevo recurso" }).click();
  const recurso = ventana(page, "Nuevo recurso");
  await recurso.getByLabel("Tipo", { exact: true }).selectOption("camion");
  await recurso.getByLabel("Camión").selectOption({ label: "ZZ001ZZ" });
  await recurso.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Nuevo recurso")).toHaveCount(0);
  await confirmar(page, "Iniciar ejecución");
  await expect(estado).toHaveText("En ejecución");
  await confirmar(page, "Finalizar servicio");
  await expect(estado).toHaveText("Finalizado");
  const urlOriginal = page.url();
  const codigoOriginal = (await page.locator("h1").innerText()).match(CODIGO);
  expect(
    codigoOriginal,
    "el título del original no trae su código",
  ).not.toBeNull();

  // 1. Se cotiza la renovación del vencimiento del camión.
  const vencimiento = page.locator('[data-vencimiento="Camión ZZ001ZZ"]');
  await vencimiento.getByRole("link", { name: "Cotizar renovación" }).click();
  const renovacion = ventana(page, "Cotizar renovación");
  await expect(renovacion).toContainText("Camión ZZ001ZZ");
  await renovacion.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}\/[a-z-]+$/);
  expect(page.url()).not.toBe(urlOriginal);
  const urlNuevo = page.url();
  await expect(estado).toHaveText("Creado");
  await expect(page.locator("h1")).toContainText(
    `Renovación de ${codigoOriginal?.[0]}`,
  );
  await expect(page.locator("[data-renueva]")).toHaveText(
    `Renueva ${codigoOriginal?.[0]}`,
  );
  await expect(
    page.getByRole("heading", { name: "Recursos", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "ZZ001ZZ" })).toBeVisible();

  // 2. El enlace lleva al original, y su vencimiento quedó renovado con el enlace al nuevo.
  await page.locator("[data-renueva]").getByRole("link").click();
  await expect(page).toHaveURL(urlOriginal);
  await expect(vencimiento.locator("td").nth(3)).toContainText("Renovado ·");
  await expect(
    vencimiento.getByRole("link", { name: "Cotizar renovación" }),
  ).toHaveCount(0);
  await vencimiento.locator("td").nth(3).getByRole("link").click();
  await expect(page).toHaveURL(urlNuevo);
});
