/**
 * Cobros de facturas (F2-07, ADR 0037), en un navegador de verdad contra la
 * imagen que se publica. Lo recorre una operadora, que el administrador da de
 * alta acá mismo, sobre un servicio que ella crea y cotiza:
 *
 * 1. una factura en pesos de 1.210,00 con IVA, vencida, aparece en *Por cobrar*
 *    con sus días de atraso;
 * 2. un primer cobro parcial deja el saldo a la vista, con los días entre la
 *    factura y el cobro;
 * 3. un cobro de más vuelve con el mensaje al lado del importe y lo escrito, y
 *    el segundo cobro, con una retención, salda la factura: queda *Cobrada*,
 *    ya no ofrece cobrar y sale de *Por cobrar*;
 * 4. una factura en dólares se cobra desde una cuenta en pesos: sin tipo de
 *    cambio el cobro no entra, con él se ve lo que entró a la cuenta;
 * 5. el servicio y la orden de compra muestran el avance;
 * 6. cobrar desde *Por cobrar* y desde el servicio abre la misma ventana, que
 *    dice lo que falta cobrar, y la factura saldada sale de *Por cobrar*;
 *    la fila lleva a la pantalla de la factura (F3-07).
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Cobros de prueba — ejemplo";
/** El número de una factura no se repite entre las vigentes: cada corrida usa los suyos. */
const SUFIJO = Date.now();
const FACTURA_EN_PESOS = `0000-COB-${SUFIJO}-1`;
const FACTURA_EN_DOLARES = `0000-COB-${SUFIJO}-2`;
const ORDEN = `OC-COB-${SUFIJO}`;

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

/** El dato del encabezado del servicio con esa etiqueta. */
function delEncabezado(page: Page, etiqueta: string) {
  return page
    .locator("header dt", { hasText: new RegExp(`^${etiqueta}$`) })
    .locator("xpath=following-sibling::dd[1]");
}

function tablaConColumna(page: Page, columna: string) {
  return page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: columna }) });
}

function filaDeFactura(page: Page, numero: string) {
  return tablaConColumna(page, "Total con IVA")
    .getByRole("row")
    .filter({ hasText: numero });
}

async function cargarFactura(
  page: Page,
  datos: {
    numero: string;
    fecha: string;
    vencimiento: string;
    importe: string;
    moneda: "ARS" | "USD";
    orden: string | null;
  },
): Promise<void> {
  await page.getByRole("link", { name: "Emitir factura" }).click();
  const nueva = ventana(page, "Nueva factura");
  await nueva.getByLabel("Número").fill(datos.numero);
  await nueva.getByLabel("Fecha", { exact: true }).fill(datos.fecha);
  await nueva.getByLabel("Vencimiento").fill(datos.vencimiento);
  await nueva
    .getByLabel("Importe sin IVA", { exact: true })
    .fill(datos.importe);
  await nueva
    .getByLabel("Moneda de Importe sin IVA")
    .selectOption(datos.moneda);
  if (datos.moneda === "USD") {
    await nueva
      .getByLabel("Tipo de cambio (pesos por dólar)", { exact: true })
      .fill("1.100,00");
    await nueva
      .getByLabel("Fuente de Tipo de cambio (pesos por dólar)")
      .fill("Cotización de ejemplo");
  }
  if (datos.orden !== null) {
    await nueva
      .getByLabel("Orden de compra")
      .selectOption({ label: datos.orden });
  }
  await nueva.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva factura")).toHaveCount(0);
}

/**
 * Abre la ventana de cobro de una factura —desde su fila en la pantalla del
 * servicio, o desde *Por cobrar*— y escribe lo que se pasa.
 */
async function abrirCobro(
  page: Page,
  numero: string,
  desde: "servicio" | "por cobrar",
  datos: {
    fecha: string;
    importe: string;
    retencion?: string;
    cuenta: string;
    tipoDeCambio?: string;
    fuente?: string;
    ordenDePago?: string;
  },
) {
  if (desde === "servicio") {
    await filaDeFactura(page, numero)
      .getByRole("link", { name: "Registrar cobro", exact: true })
      .click();
  } else {
    await page
      .getByRole("row")
      .filter({ hasText: numero })
      .getByRole("link", { name: "Registrar cobro" })
      .click();
  }
  const cobro = ventana(page, "Cobrar factura");
  await cobro.getByLabel("Fecha").fill(datos.fecha);
  await cobro.getByLabel(/^Importe \(/).fill(datos.importe);
  if (datos.retencion !== undefined) {
    await cobro.getByLabel(/^Retención/).fill(datos.retencion);
  }
  await cobro
    .getByLabel("Cuenta", { exact: true })
    .selectOption({ label: datos.cuenta });
  if (datos.tipoDeCambio !== undefined) {
    await cobro.getByLabel(/^Tipo de cambio/).fill(datos.tipoDeCambio);
  }
  if (datos.ordenDePago !== undefined) {
    await cobro
      .getByLabel("Número de la orden de pago del cliente (opcional)")
      .fill(datos.ordenDePago);
  }
  if (datos.fuente !== undefined) {
    await cobro.getByLabel("Fuente del tipo de cambio").fill(datos.fuente);
  }
  return cobro;
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("una operadora cobra facturas en partes, con retención y en pesos de una factura en dólares, y sigue lo que falta en Por cobrar", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);

  // Un servicio nuevo, con una orden de compra de 1.000,00 sin IVA.
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
  await alta.getByLabel("Fecha de pedido").fill("2026-08-20");
  await alta.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}\/[a-z-]+$/);
  // La ruta del servicio, sin la etapa: lleva al panel de la etapa en la que esté.
  const servicioUrl = page.url().replace(/\/[a-z-]+$/, "");

  // La orden de compra entra en «Cotizado»: antes, la cotización (F3-01).
  await page.getByRole("link", { name: "Cargar cotización" }).click();
  const cotizacion = ventana(page, "Nueva cotización");
  await cotizacion.getByLabel("Fecha").fill("2026-08-22");
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
  await orden.getByLabel("Número").fill(ORDEN);
  await orden.getByLabel("Fecha").fill("2026-08-25");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva orden de compra")).toHaveCount(0);
  // Facturar exige la modalidad de facturación (F3-03).
  await page.getByRole("link", { name: /^Puntual/ }).click();
  const modalidad = ventana(page, "Modalidad de facturación");
  await modalidad
    .getByLabel("Modalidad de facturación")
    .selectOption({ label: "Por hitos (libre)" });
  await modalidad.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Modalidad de facturación")).toHaveCount(0);
  await expect(delEncabezado(page, "Facturación")).toHaveText(
    "Por hitos (libre)",
  );

  // 1. Una factura en pesos, vencida: 1.000,00 más 21 % de IVA son 1.210,00.
  await cargarFactura(page, {
    numero: FACTURA_EN_PESOS,
    fecha: "2026-09-01",
    vencimiento: "2026-09-15",
    importe: "1.000,00",
    moneda: "ARS",
    orden: `${ORDEN} · ARS 1.000,00`,
  });
  const factura = filaDeFactura(page, FACTURA_EN_PESOS);
  await expect(factura.getByRole("cell").nth(2)).toHaveText("ARS 1.210,00");
  await expect(factura.getByRole("cell").nth(3)).toHaveText("ARS 1.210,00");

  // Ingresos (menú de Finanzas): la factura del mes ofrece cobrar, con la misma ventana.
  await page.goto("/?mes=2026-09");
  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: "Ingresos" })
    .click();
  await page.goto("/servicios/facturas?mes=2026-09&moneda=ARS");
  const ingreso = page.getByRole("row").filter({ hasText: FACTURA_EN_PESOS });
  await ingreso.getByRole("link", { name: "Registrar cobro" }).click();
  await expect(
    ventana(page, "Cobrar factura").locator("[data-pendiente]"),
  ).toHaveText("ARS 1.210,00");
  await ventana(page, "Cobrar factura")
    .getByRole("link", { name: "Cerrar" })
    .click();
  await expect(ventana(page, "Cobrar factura")).toHaveCount(0);
  await expect(page).toHaveURL(/\/servicios\/facturas\?mes=2026-09/);

  await page.goto("/servicios/por-cobrar");
  const porCobrar = page.getByRole("row").filter({ hasText: FACTURA_EN_PESOS });
  await expect(porCobrar.getByRole("cell").nth(2)).toHaveText(
    "Empresa Ejemplo Uno S.A.",
  );
  await expect(porCobrar.getByRole("cell").nth(3)).toHaveText("15/09/2026");
  await expect(porCobrar.getByRole("cell").nth(5)).toHaveText("ARS 1.210,00");
  await expect(porCobrar.getByRole("cell").nth(6)).toHaveText(/^\d+ días$/);
  // La fila entera lleva a la factura: sus datos, lo que falta cobrar y el mismo botón.
  await porCobrar.getByRole("link", { name: FACTURA_EN_PESOS }).click();
  await expect(page).toHaveURL(/\/servicios\/facturas\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: `Factura ${FACTURA_EN_PESOS}` }),
  ).toBeVisible();
  await expect(page.locator("[data-saldo]")).toHaveText("ARS 1.210,00");
  await expect(page.getByText("Todavía no tiene cobros.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Registrar cobro" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /^SRV-/ }).click();
  await expect(page).toHaveURL((url) => url.href.startsWith(`${servicioUrl}/`));

  // 2. El primer cobro, desde *Por cobrar*: la ventana dice lo que falta y,
  //    al guardar, vuelve al listado con el saldo nuevo. 500,00 de 1.210,00, a 34 días de la factura.
  await page.goto("/servicios/por-cobrar");
  const primero = await abrirCobro(page, FACTURA_EN_PESOS, "por cobrar", {
    fecha: "2026-10-05",
    importe: "500,00",
    cuenta: "Caja · ARS",
    ordenDePago: "OP-E2E-1",
  });
  await expect(primero.locator("[data-pendiente]")).toHaveText("ARS 1.210,00");
  await primero.getByRole("button", { name: "Cobrar" }).click();
  await expect(ventana(page, "Cobrar factura")).toHaveCount(0);
  await expect(page).toHaveURL(/\/servicios\/por-cobrar/);
  await expect(porCobrar.getByRole("cell").nth(5)).toHaveText("ARS 710,00");
  await page.goto(servicioUrl);
  await expect(factura.getByRole("cell").nth(3)).toHaveText("ARS 710,00");
  await factura
    .getByRole("link", { name: FACTURA_EN_PESOS, exact: true })
    .click();
  await expect(page.locator("[data-cobrado]")).toHaveText("ARS 500,00");
  await expect(page.getByText("Retenido: ARS 0,00")).toBeVisible();
  await expect(page.locator("[data-saldo]")).toHaveText("ARS 710,00");
  await page.goto(servicioUrl);
  const cobros = tablaConColumna(page, "Días desde la factura");
  const filaDelPrimero = cobros.getByRole("row").nth(1);
  await expect(filaDelPrimero.getByRole("cell").nth(0)).toHaveText(
    "05/10/2026",
  );
  await expect(filaDelPrimero.getByRole("cell").nth(1)).toHaveText("34");
  await expect(filaDelPrimero.getByRole("cell").nth(2)).toHaveText(
    "ARS 500,00",
  );
  await expect(filaDelPrimero.getByRole("cell").nth(4)).toHaveText("Caja");
  await expect(filaDelPrimero.getByRole("cell").nth(9)).toHaveText("OP-E2E-1");

  // 3. Cobrar de más: 700,00 más 11,00 de retención pasan los 710,00 que faltan.
  await page.goto("/servicios/por-cobrar");
  const deMas = await abrirCobro(page, FACTURA_EN_PESOS, "por cobrar", {
    fecha: "2026-10-06",
    importe: "700,00",
    retencion: "11,00",
    cuenta: "Caja · ARS",
  });
  await deMas.getByRole("button", { name: "Cobrar" }).click();
  await expect(deMas.getByText(/DOM-0012/)).toHaveText(
    "DOM-0012 · El importe supera lo que falta cobrar: quedan ARS 710,00.",
  );
  await expect(deMas.getByLabel(/^Importe \(/)).toHaveValue("700,00");
  await expect(deMas.getByLabel(/^Retención/)).toHaveValue("11,00");

  // El segundo, con retención, salda la factura.
  await deMas.getByLabel(/^Importe \(/).fill("500,00");
  await deMas.getByLabel(/^Retención/).fill("210,00");
  await deMas.getByRole("button", { name: "Cobrar" }).click();
  await expect(ventana(page, "Cobrar factura")).toHaveCount(0);
  await expect(porCobrar).toHaveCount(0);
  await page.goto("/servicios/facturas?mes=2026-09&moneda=ARS");
  await expect(ingreso).toContainText("1.210,00");
  await expect(
    ingreso.getByRole("link", { name: "Registrar cobro" }),
  ).toHaveCount(0);
  await page.goto(servicioUrl);
  await expect(factura.getByRole("cell").nth(3)).toHaveText("ARS 0,00");
  await factura
    .getByRole("link", { name: FACTURA_EN_PESOS, exact: true })
    .click();
  await expect(page.locator("[data-cobrado]")).toHaveText("ARS 1.000,00");
  await expect(page.getByText("Retenido: ARS 210,00")).toBeVisible();
  await expect(page.locator("[data-estado-cobrada]")).toHaveText("Cobrada");
  await page.goto(servicioUrl);
  await expect(
    factura.getByRole("link", { name: "Registrar cobro", exact: true }),
  ).toHaveCount(0);
  await expect(cobros.getByRole("row")).toHaveCount(3);

  // 4. Una factura en dólares (100,00 más IVA son 121,00), cobrada desde una cuenta en pesos.
  await cargarFactura(page, {
    numero: FACTURA_EN_DOLARES,
    fecha: "2026-10-10",
    vencimiento: "2026-12-10",
    importe: "100,00",
    moneda: "USD",
    orden: null,
  });
  const enDolares = filaDeFactura(page, FACTURA_EN_DOLARES);
  await expect(enDolares.getByRole("cell").nth(2)).toHaveText("USD 121,00");

  const sinCambio = await abrirCobro(page, FACTURA_EN_DOLARES, "servicio", {
    fecha: "2026-10-12",
    importe: "50,00",
    cuenta: "Caja · ARS",
  });
  await sinCambio.getByRole("button", { name: "Cobrar" }).click();
  await expect(sinCambio.getByText(/DOM-0013/)).toContainText(
    "Cargá el tipo de cambio del día",
  );
  await sinCambio.getByLabel(/^Tipo de cambio/).fill("1.200,00");
  await sinCambio
    .getByLabel("Fuente del tipo de cambio")
    .fill("Cotización de prueba");
  await sinCambio.getByRole("button", { name: "Cobrar" }).click();
  await expect(ventana(page, "Cobrar factura")).toHaveCount(0);
  await expect(enDolares.getByRole("cell").nth(3)).toHaveText("USD 71,00");
  const filaEnDolares = cobros
    .getByRole("row")
    .filter({ hasText: "Cotización de prueba" });
  await expect(filaEnDolares.getByRole("cell").nth(2)).toHaveText("USD 50,00");
  await expect(filaEnDolares.getByRole("cell").nth(5)).toHaveText(
    "ARS 60.000,00",
  );
  await expect(filaEnDolares.getByRole("cell").nth(6)).toHaveText(
    "1.200,00 · Cotización de prueba",
  );

  // 5. Lo facturado, lo cobrado y lo que falta, por moneda y sin convertir, en las métricas del panel.
  const metrica = (titulo: string) =>
    page.getByRole("heading", { name: titulo, exact: true }).locator("..");
  await expect(metrica("Facturado (con IVA) · ARS")).toContainText(
    "ARS 1.210,00",
  );
  await expect(metrica("Cobrado · ARS")).toContainText("ARS 1.210,00");
  await expect(metrica("Facturado (con IVA) · USD")).toContainText(
    "USD 121,00",
  );
  await expect(metrica("Cobrado · USD")).toContainText("USD 50,00");
  await expect(
    page
      .getByRole("heading", { name: "Por cobrar (con IVA)", exact: true })
      .locator(".."),
  ).toContainText(["ARS 0,00", "USD 71,00"]);
});
