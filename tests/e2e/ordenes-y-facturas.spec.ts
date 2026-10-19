/**
 * Órdenes de compra y facturas de un servicio (F2-06, ADR 0036), en un
 * navegador de verdad contra la imagen que se publica. Lo recorre una
 * operadora, que el administrador da de alta acá mismo, sobre un servicio que
 * ella crea y pasa a «Cotizado» cargándole una cotización (F3-01):
 *
 * 1. carga una orden de compra de 1.000,00 sin IVA: el servicio pasa a
 *    «Adjudicado» y la orden muestra todo por facturar;
 * 2. carga una factura de 400,00 y **ve el IVA y el total calculados antes de
 *    guardar** (y que se actualizan al cambiar la alícuota);
 * 3. carga una segunda de 250,00 al 10,5 %: el listado trae sin IVA, alícuota,
 *    IVA y total, y la orden muestra facturado y saldo;
 * 4. una tercera que pasa el saldo se guarda y la orden avisa, sin error.
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Orden de compra y facturas de prueba — ejemplo";
/** El número de una factura no se repite entre las vigentes: cada corrida usa los suyos. */
const FACTURA = `0000-E2E-${Date.now()}`;

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

function tablaConColumna(page: Page, columna: string) {
  return page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: columna }) });
}

/** Una factura sin documento, con lo que se escribe; devuelve la ventana ya cerrada o abierta según el caso. */
async function cargarFactura(
  page: Page,
  datos: {
    numero: string;
    fecha: string;
    vencimiento: string;
    importe: string;
  },
  alicuota: "210" | "105",
): Promise<void> {
  await page.getByRole("link", { name: "Nueva factura" }).click();
  const nueva = ventana(page, "Nueva factura");
  await nueva.getByLabel("Número").fill(datos.numero);
  await nueva.getByLabel("Fecha", { exact: true }).fill(datos.fecha);
  await nueva.getByLabel("Vencimiento").fill(datos.vencimiento);
  await nueva
    .getByLabel("Importe sin IVA", { exact: true })
    .fill(datos.importe);
  await nueva.getByLabel("IVA", { exact: true }).selectOption(alicuota);
  await nueva
    .getByLabel("Orden de compra")
    .selectOption({ label: "OC-E2E-1 · ARS 1.000,00" });
  await nueva.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva factura")).toHaveCount(0);
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("una operadora carga una orden de compra y facturas parciales, ve el IVA antes de guardar y el saldo por facturar", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);

  // Un servicio nuevo que pasa a «Cotizado» con su cotización: ahí la orden de compra lo adjudica.
  await page.goto("/servicios");
  await page.getByRole("link", { name: "Alta de servicio" }).click();
  const alta = ventana(page, "Alta de servicio");
  await alta
    .getByLabel("Cliente")
    .selectOption({ label: "Empresa Ejemplo Uno S.A." });
  await alta
    .getByLabel("Tipo de servicio")
    .selectOption({ label: "Logística" });
  await alta.getByLabel("Título").fill(TITULO);
  await alta.getByLabel("Responsable").selectOption({ label: ADMIN });
  await alta.getByLabel("Fecha de pedido").fill("2026-10-10");
  await alta.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Nueva cotización" }).click();
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
  const estado = page.locator("[data-estado-del-servicio]");
  await expect(estado).toHaveText("Cotizado");
  await expect(
    page.getByText("Todavía no hay órdenes de compra cargadas."),
  ).toBeVisible();
  await expect(
    page.getByText("Todavía no hay facturas cargadas."),
  ).toBeVisible();

  // 1. La orden de compra: sin documento, que es opcional. El servicio pasa a «Adjudicado».
  await page.getByRole("link", { name: "Nueva orden de compra" }).click();
  const orden = ventana(page, "Nueva orden de compra");
  await expect(orden.getByLabel("Fecha")).toHaveAttribute("type", "date");
  await orden.getByLabel("Número").fill("OC-E2E-1");
  await orden.getByLabel("Fecha").fill("2026-10-12");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva orden de compra")).toHaveCount(0);

  await expect(estado).toHaveText("Adjudicado");
  const ordenes = tablaConColumna(page, "Saldo por facturar");
  const filaDeOrden = ordenes.getByRole("row").nth(1);
  await expect(filaDeOrden.getByRole("cell").nth(0)).toHaveText("OC-E2E-1");
  await expect(filaDeOrden.getByRole("cell").nth(1)).toHaveText("12/10/2026");
  await expect(filaDeOrden.getByRole("cell").nth(2)).toHaveText("ARS 1.000,00");
  await expect(filaDeOrden.getByRole("cell").nth(3)).toHaveText("ARS 0,00");
  await expect(filaDeOrden.getByRole("cell").nth(4)).toHaveText("ARS 1.000,00");
  // Facturar exige la modalidad de facturación (F3-03).
  await page.getByRole("link", { name: "Elegir la modalidad" }).click();
  const modalidad = ventana(page, "Modalidad de facturación");
  await modalidad
    .getByLabel("Modalidad de facturación")
    .selectOption({ label: "Por hitos (libre)" });
  await modalidad.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Modalidad de facturación")).toHaveCount(0);
  await expect(page.locator("[data-modalidad]")).toHaveText(
    "Modalidad: Por hitos (libre)",
  );

  // 2. La primera factura: el IVA y el total se ven antes de guardar y siguen lo que se escribe.
  await page.getByRole("link", { name: "Nueva factura" }).click();
  const primera = ventana(page, "Nueva factura");
  await expect(primera.getByLabel("IVA", { exact: true })).toHaveValue("210");
  await expect(primera.locator("[data-iva]")).toHaveText("—");
  await primera.getByLabel("Importe sin IVA", { exact: true }).fill("400,00");
  await expect(primera.locator("[data-iva]")).toHaveText("ARS 84,00");
  await expect(primera.locator("[data-total-con-iva]")).toHaveText(
    "ARS 484,00",
  );
  await primera.getByLabel("IVA", { exact: true }).selectOption("105");
  await expect(primera.locator("[data-iva]")).toHaveText("ARS 42,00");
  await expect(primera.locator("[data-total-con-iva]")).toHaveText(
    "ARS 442,00",
  );
  await primera.getByLabel("IVA", { exact: true }).selectOption("210");
  await expect(primera.locator("[data-total-con-iva]")).toHaveText(
    "ARS 484,00",
  );
  await primera.getByLabel("Número").fill(`${FACTURA}-1`);
  await primera.getByLabel("Fecha", { exact: true }).fill("2026-10-13");
  await primera.getByLabel("Vencimiento").fill("2026-11-13");
  await primera
    .getByLabel("Orden de compra")
    .selectOption({ label: "OC-E2E-1 · ARS 1.000,00" });
  await primera.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva factura")).toHaveCount(0);

  const facturas = tablaConColumna(page, "Total con IVA");
  const filaDePrimera = facturas.getByRole("row").nth(1);
  await expect(filaDePrimera.getByRole("cell").nth(0)).toHaveText(
    `${FACTURA}-1`,
  );
  await expect(filaDePrimera.getByRole("cell").nth(1)).toHaveText("13/10/2026");
  await expect(filaDePrimera.getByRole("cell").nth(2)).toHaveText("13/11/2026");
  await expect(filaDePrimera.getByRole("cell").nth(3)).toHaveText("OC-E2E-1");
  await expect(filaDePrimera.getByRole("cell").nth(4)).toHaveText("ARS 400,00");
  await expect(filaDePrimera.getByRole("cell").nth(5)).toHaveText("21 %");
  await expect(filaDePrimera.getByRole("cell").nth(6)).toHaveText("ARS 84,00");
  await expect(filaDePrimera.getByRole("cell").nth(7)).toHaveText("ARS 484,00");

  // 3. La segunda, parcial, al 10,5 %: el saldo de la orden baja en el importe sin IVA.
  await cargarFactura(
    page,
    {
      numero: `${FACTURA}-2`,
      fecha: "2026-10-20",
      vencimiento: "2026-11-20",
      importe: "250,00",
    },
    "105",
  );
  await expect(facturas.getByRole("row")).toHaveCount(3);
  const filaDeSegunda = facturas.getByRole("row").nth(1);
  await expect(filaDeSegunda.getByRole("cell").nth(0)).toHaveText(
    `${FACTURA}-2`,
  );
  await expect(filaDeSegunda.getByRole("cell").nth(5)).toHaveText("10,5 %");
  await expect(filaDeSegunda.getByRole("cell").nth(6)).toHaveText("ARS 26,25");
  await expect(filaDeSegunda.getByRole("cell").nth(7)).toHaveText("ARS 276,25");
  await expect(filaDeOrden.getByRole("cell").nth(3)).toHaveText("ARS 650,00");
  await expect(filaDeOrden.getByRole("cell").nth(4)).toHaveText("ARS 350,00");
  await expect(page.getByRole("status")).toHaveCount(0);

  // 4. Facturar de más no se impide: se guarda y la orden lo avisa.
  await cargarFactura(
    page,
    {
      numero: `${FACTURA}-3`,
      fecha: "2026-10-27",
      vencimiento: "2026-11-27",
      importe: "400,00",
    },
    "210",
  );
  await expect(facturas.getByRole("row")).toHaveCount(4);
  await expect(filaDeOrden.getByRole("cell").nth(3)).toHaveText("ARS 1.050,00");
  await expect(filaDeOrden.getByRole("cell").nth(4)).toContainText(
    "ARS -50,00",
  );
  await expect(page.getByRole("status")).toHaveText(
    "Se facturó ARS 50,00 más que la orden de compra",
  );
  await expect(estado).toHaveText("Adjudicado");
});
