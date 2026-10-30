/**
 * Cotizar la renovación desde el calendario (F4-08), en un navegador de verdad
 * contra la imagen que se publica. Una operadora finaliza un servicio con un
 * camión, lleva su vencimiento a una fecha fija y desde el calendario de ese mes:
 *
 * 1. lo ve en la grilla y en la lista, cada uno con «Cotizar renovación»;
 * 2. confirma en una ventana y llega al servicio nuevo, en «Creado»;
 * 3. el vencimiento sigue en el calendario, marcado «Renovado» con el enlace al
 *    servicio nuevo y sin «Cotizar renovación» (F5-03).
 *
 * Usa `operador.catalogos@ejemplo.test`. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Renovación desde el calendario — ejemplo";
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

test("desde el calendario se cotiza la renovación de un vencimiento: lleva al servicio nuevo en «Creado» y el vencimiento queda en el calendario como renovado, con su enlace", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);

  // Un servicio con un camión, hasta «Finalizado»: su vencimiento se lleva a una fecha fija.
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
  await orden.getByLabel("Número").fill("OC-E2E-CAL");
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
  const codigoOriginal = (await page.locator("h1").innerText()).match(CODIGO);
  expect(
    codigoOriginal,
    "el título del original no trae su código",
  ).not.toBeNull();
  await page
    .locator('[data-vencimiento="Camión ZZ001ZZ"]')
    .getByRole("link", { name: "Corregir fecha" })
    .click();
  const correccion = ventana(page, "Corregir la fecha");
  await correccion.getByLabel("Vence el").fill("2040-02-01");
  await correccion.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Corregir la fecha")).toHaveCount(0);

  // 1. En el calendario de ese mes, en la grilla y en la lista, con el botón.
  await page.goto("/calendario?mes=2040-02");
  const enGrilla = page
    .getByRole("table")
    .first()
    .locator("li")
    .filter({ hasText: codigoOriginal?.[0] ?? "" });
  const enLista = page
    .getByRole("table")
    .last()
    .getByRole("row")
    .filter({ hasText: codigoOriginal?.[0] ?? "" });
  await expect(
    enGrilla.getByRole("link", { name: "Cotizar renovación" }),
  ).toBeVisible();
  await expect(
    enLista.getByRole("link", { name: "Cotizar renovación" }),
  ).toBeVisible();

  // 2. Se confirma y lleva al servicio nuevo, en «Creado».
  await enLista.getByRole("link", { name: "Cotizar renovación" }).click();
  const renovacion = ventana(page, "Cotizar renovación");
  await expect(renovacion).toContainText("Camión ZZ001ZZ");
  await renovacion.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}\/[a-z-]+$/);
  await expect(estado).toHaveText("Creado");
  await expect(page.locator("h1")).toContainText(
    `Renovación de ${codigoOriginal?.[0]}`,
  );
  const urlNuevo = page.url();
  const codigoNuevo = (await page.locator("h1").innerText()).match(CODIGO);
  expect(codigoNuevo, "el título del nuevo no trae su código").not.toBeNull();

  // 3. Sigue en el calendario, renovado, con el enlace al servicio nuevo.
  await page.goto("/calendario?mes=2040-02");
  for (const entrada of [enGrilla, enLista]) {
    await expect(entrada).toContainText("Renovado");
    await expect(
      entrada.getByRole("link", { name: "Cotizar renovación" }),
    ).toHaveCount(0);
    await entrada
      .getByRole("link", { name: codigoNuevo?.[0] ?? "", exact: true })
      .click();
    await expect(page).toHaveURL(urlNuevo);
    await page.goto("/calendario?mes=2040-02");
  }
});
