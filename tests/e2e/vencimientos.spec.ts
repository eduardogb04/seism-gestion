/**
 * Los vencimientos de un trabajo terminado (F4-02), en un navegador de verdad
 * contra la imagen que se publica. Lo recorre una operadora, que el
 * administrador da de alta acá mismo, sobre un servicio de un tipo con plazo de
 * vencimiento al que le asigna dos camiones:
 *
 * 1. al finalizarlo aparecen dos vencimientos, uno por camión, con su fecha;
 * 2. corrige la fecha de uno: queda de origen «Manual» con la fecha nueva;
 * 3. descarta el otro con su motivo: queda «Descartado · motivo» y ya no se
 *    corrige ni se descarta.
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Vencimientos de prueba — ejemplo";
const FECHA = /^\d{2}\/\d{2}\/\d{4}$/;

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

test("al finalizar un servicio con dos camiones aparecen dos vencimientos; se corrige la fecha de uno y se descarta el otro con motivo", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);

  // Un servicio de un tipo con plazo que llega a «Adjudicado» por su cotización y su orden de compra.
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
  await orden.getByLabel("Número").fill("OC-E2E-VENC");
  await orden.getByLabel("Fecha").fill("2026-10-12");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva orden de compra")).toHaveCount(0);
  const estado = page.locator("[data-estado-del-servicio]");
  await expect(estado).toHaveText("Adjudicado");

  // Dos camiones asignados.
  for (const patente of ["ZZ001ZZ", "ZZ002ZZ"]) {
    await page.getByRole("link", { name: "Nuevo recurso" }).click();
    const recurso = ventana(page, "Nuevo recurso");
    await recurso.getByLabel("Tipo", { exact: true }).selectOption("camion");
    await recurso.getByLabel("Camión").selectOption({ label: patente });
    await recurso.getByRole("button", { name: "Guardar" }).click();
    await expect(ventana(page, "Nuevo recurso")).toHaveCount(0);
  }
  await confirmar(page, "Iniciar ejecución");
  await expect(estado).toHaveText("En ejecución");
  await expect(
    page.getByRole("heading", { name: "Vencimientos", exact: true }),
  ).toHaveCount(0);

  // 1. Al finalizar: un vencimiento por camión.
  await confirmar(page, "Finalizar servicio");
  await expect(estado).toHaveText("Finalizado");
  await expect(
    page.getByRole("heading", { name: "Vencimientos", exact: true }),
  ).toBeVisible();
  const primero = page.locator('[data-vencimiento="Camión ZZ001ZZ"]');
  const segundo = page.locator('[data-vencimiento="Camión ZZ002ZZ"]');
  await expect(page.locator("[data-vencimiento]")).toHaveCount(2);
  for (const fila of [primero, segundo]) {
    await expect(fila.locator("td").nth(0)).toHaveText(FECHA);
    await expect(fila.locator("td").nth(2)).toHaveText("Calculado");
    await expect(fila.locator("td").nth(3)).toHaveText("Pendiente");
  }

  // 2. Se corrige la fecha de uno: queda a mano.
  await primero.getByRole("link", { name: "Corregir fecha" }).click();
  const correccion = ventana(page, "Corregir la fecha");
  await correccion.getByLabel("Vence el").fill("2040-02-01");
  await correccion.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Corregir la fecha")).toHaveCount(0);
  await expect(primero.locator("td").nth(0)).toHaveText("01/02/2040");
  await expect(primero.locator("td").nth(2)).toHaveText("Manual");

  // 3. Se descarta el otro, con su motivo.
  await segundo.getByRole("link", { name: "Descartar" }).click();
  const descarte = ventana(page, "Descartar el vencimiento");
  await descarte.getByRole("button", { name: "Descartar" }).click();
  await expect(descarte.getByText("Escribí el motivo.")).toBeVisible();
  await descarte.getByLabel("Motivo").fill("El cliente vendió el camión");
  await descarte.getByRole("button", { name: "Descartar" }).click();
  await expect(ventana(page, "Descartar el vencimiento")).toHaveCount(0);
  await expect(segundo.locator("td").nth(3)).toHaveText(
    "Descartado · El cliente vendió el camión",
  );
  await expect(
    segundo.getByRole("link", { name: "Corregir fecha" }),
  ).toHaveCount(0);
  await expect(segundo.getByRole("link", { name: "Descartar" })).toHaveCount(0);
});

test("un servicio recurrente muestra «Renovar contrato» desde «Adjudicado» y lo mueve al cambiar la vigencia", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);
  const titulo = "Contrato recurrente de prueba — ejemplo";
  const vencimientos = page.getByRole("heading", {
    name: "Vencimientos",
    exact: true,
  });
  const renovar = page.locator('[data-vencimiento="Renovar contrato"]');

  await page.goto("/servicios");
  await page.getByRole("link", { name: "Alta de servicio" }).click();
  const alta = ventana(page, "Alta de servicio");
  await alta
    .getByLabel("Cliente")
    .selectOption({ label: "Empresa Ejemplo Uno S.A." });
  await alta
    .getByLabel("Tipo de servicio")
    .selectOption({ label: "Certificación de camiones" });
  await alta.getByLabel("Título").fill(titulo);
  await alta.getByLabel("Modalidad").selectOption("recurrente");
  await alta.getByLabel("Responsable").selectOption({ label: ADMIN });
  await alta.getByLabel("Fecha de pedido").fill("2026-10-10");
  await alta.getByLabel("Vigencia desde").fill("2026-11-01");
  await alta.getByLabel("Vigencia hasta").fill("2027-10-31");
  await alta.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}\/[a-z-]+$/);

  // Antes de «Adjudicado» la sección no está.
  await expect(vencimientos).toHaveCount(0);

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
  await orden.getByLabel("Número").fill("OC-E2E-CONTRATO");
  await orden.getByLabel("Fecha").fill("2026-10-12");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva orden de compra")).toHaveCount(0);
  const estado = page.locator("[data-estado-del-servicio]");
  await expect(estado).toHaveText("Adjudicado");

  // En «Adjudicado» y en «En ejecución» se ve, sin nada para cargar ni corregir.
  await expect(vencimientos).toBeVisible();
  await expect(renovar.locator("td").nth(0)).toHaveText("31/10/2027");
  await expect(renovar.locator("td").nth(2)).toHaveText("Calculado");
  await expect(renovar.locator("td").nth(3)).toHaveText("Pendiente");
  await expect(
    page.getByRole("link", { name: "Nuevo vencimiento" }),
  ).toHaveCount(0);
  await expect(
    renovar.getByRole("link", { name: "Corregir fecha" }),
  ).toHaveCount(0);
  await confirmar(page, "Iniciar ejecución");
  await expect(estado).toHaveText("En ejecución");
  await expect(renovar.locator("td").nth(0)).toHaveText("31/10/2027");

  // Cambiar la vigencia lo mueve.
  await page.getByRole("link", { name: "Editar", exact: true }).click();
  const edicion = ventana(page, "Edición de servicio");
  await edicion.getByLabel("Vigencia hasta").fill("2028-04-30");
  await edicion.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Edición de servicio")).toHaveCount(0);
  await expect(renovar).toHaveCount(1);
  await expect(renovar.locator("td").nth(0)).toHaveText("30/04/2028");
});
