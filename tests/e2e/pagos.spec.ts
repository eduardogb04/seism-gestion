/**
 * Pagos de egresos (F2-09, ADR 0034), en un navegador de verdad contra la imagen
 * que se publica. Los recorre una operadora, que el administrador da de alta
 * acá mismo, sobre egresos de la semilla:
 *
 * 1. *Por pagar* muestra los que tienen saldo, con los días de atraso del que
 *    ya venció, y con la casilla, también el que está pagado entero;
 * 2. un egreso en pesos se paga en dos partes: un pago de más vuelve con el
 *    mensaje al lado del campo y lo escrito, y el segundo lo deja en saldo cero
 *    (queda *Pagado* y ya no ofrece el formulario);
 * 3. un egreso en dólares se paga desde una cuenta en pesos: sin tipo de cambio
 *    el pago no entra, con él se ve lo que salió de la cuenta;
 * 4. la cuenta con pagos no se da de baja, y anular un pago devuelve el saldo.
 *
 * Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";

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

function fila(page: Page, texto: string | RegExp) {
  return page.getByRole("row", { name: texto });
}

/** Abre un egreso desde *Por pagar*. */
async function abrirEgreso(page: Page, concepto: string): Promise<void> {
  await page.goto("/egresos/pagos");
  await fila(page, new RegExp(concepto))
    .getByRole("link", { name: concepto })
    .click();
  await expect(page.getByRole("heading", { name: concepto })).toBeVisible();
}

async function registrarPago(
  page: Page,
  pago: {
    readonly fecha: string;
    readonly importe: string;
    readonly cuenta: string;
    readonly tipoDeCambio?: string;
    readonly fuente?: string;
  },
): Promise<void> {
  await page.getByLabel("Fecha", { exact: true }).fill(pago.fecha);
  await page.getByLabel(/^Importe/).fill(pago.importe);
  await page
    .getByLabel("Cuenta", { exact: true })
    .selectOption({ label: pago.cuenta });
  await page.getByLabel(/^Tipo de cambio/).fill(pago.tipoDeCambio ?? "");
  await page.getByLabel("Fuente del tipo de cambio").fill(pago.fuente ?? "");
  await page.getByRole("button", { name: "Registrar pago" }).click();
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("una operadora paga un egreso en dos partes y otro en dólares desde una cuenta en pesos; la cuenta con pagos no se da de baja y anular devuelve el saldo", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);

  // 1. Por pagar: lo que tiene saldo, el atraso del vencido y, con la casilla, lo pagado.
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await menu.getByRole("link", { name: "Por pagar" }).click();
  await expect(page.getByRole("heading", { name: "Por pagar" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Por pagar" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(fila(page, /Honorarios contables/)).toContainText(
    "ARS 300.000,00",
  );
  await expect(fila(page, /Honorarios contables/)).toContainText(/\d+ días?/);
  await expect(fila(page, /Curso de capacitación/)).toContainText("USD 500,00");
  // El otro Combustible (12/10) está sin pagar; el del 03/09 está pagado entero.
  await expect(fila(page, /03\/09\/2026/)).toHaveCount(0);
  await page.getByLabel("Ver también los pagados").check();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(fila(page, /03\/09\/2026/)).toContainText("ARS 0,00");

  // 2. Un egreso en pesos, en dos partes.
  await abrirEgreso(page, "Repuestos para el servicio");
  await expect(page.locator("[data-saldo]")).toHaveText("ARS 325.000,00");
  await registrarPago(page, {
    fecha: "2026-10-03",
    importe: "100.000,00",
    cuenta: "Caja · ARS",
  });
  await expect(page.locator("[data-pagado]")).toHaveText("ARS 100.000,00");
  await expect(page.locator("[data-saldo]")).toHaveText("ARS 225.000,00");
  await expect(page.locator("[data-estado-pagado]")).toHaveCount(0);

  await registrarPago(page, {
    fecha: "2026-10-04",
    importe: "300.000,00",
    cuenta: "Caja · ARS",
  });
  await expect(page.locator("[data-error-de-campo]")).toHaveText(
    /DOM-0012 · El importe supera lo que falta pagar: quedan ARS 225.000,00/,
  );
  await expect(page.getByLabel(/^Importe/)).toHaveValue("300.000,00");
  await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue(
    "2026-10-04",
  );
  await expect(page.locator("[data-saldo]")).toHaveText("ARS 225.000,00");

  await page.getByLabel(/^Importe/).fill("225.000,00");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.locator("[data-saldo]")).toHaveText("ARS 0,00");
  await expect(page.locator("[data-estado-pagado]")).toHaveText("Pagado");
  await expect(
    page.getByRole("button", { name: "Registrar pago" }),
  ).toHaveCount(0);
  await expect(fila(page, /03\/10\/2026/)).toContainText("ARS 100.000,00");
  await expect(fila(page, /04\/10\/2026/)).toContainText("ARS 225.000,00");

  // 3. Un egreso en dólares, desde una cuenta en pesos.
  await abrirEgreso(page, "Notebook para el equipo");
  await registrarPago(page, {
    fecha: "2026-10-05",
    importe: "500,00",
    cuenta: "Banco Ejemplo Dos — cuenta corriente · ARS",
  });
  await expect(page.locator("[data-error-de-campo]")).toHaveText(
    /DOM-0013 · Cargá el tipo de cambio del día/,
  );
  await expect(page.getByLabel(/^Importe/)).toHaveValue("500,00");
  await expect(page.locator("[data-pagado]")).toHaveText("USD 0,00");

  await page.getByLabel(/^Tipo de cambio/).fill("1.200,00");
  await page
    .getByLabel("Fuente del tipo de cambio")
    .fill("Cotización de ejemplo");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.locator("[data-pagado]")).toHaveText("USD 500,00");
  await expect(page.locator("[data-saldo]")).toHaveText("USD 700,00");
  await expect(fila(page, /05\/10\/2026/)).toContainText("ARS 600.000,00");
  await expect(fila(page, /05\/10\/2026/)).toContainText(
    "1.200,00 · Cotización de ejemplo",
  );

  // 4. La cuenta con pagos no se da de baja; anular un pago devuelve el saldo.
  await page.goto("/catalogo/cuentas");
  await fila(page, /^Caja/).getByRole("link", { name: "Dar de baja" }).click();
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(
    page.getByRole("dialog", { name: "Baja de cuenta" }),
  ).toContainText("DOM-0010");

  await abrirEgreso(page, "Notebook para el equipo");
  await fila(page, /05\/10\/2026/)
    .getByRole("link", { name: "Anular" })
    .click();
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(page.locator("[data-saldo]")).toHaveText("USD 1.200,00");
  await expect(page.getByText("Todavía no tiene pagos.")).toBeVisible();
});
