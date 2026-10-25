/**
 * El inicio con el tablero (F2-10, ADR 0038), en un navegador de verdad contra
 * la imagen que se publica, sobre los datos de demostración (octubre de 2026):
 *
 * 1. entra el administrador y el inicio muestra el mes actual, con mes anterior
 *    y mes siguiente que navegan;
 * 2. en octubre de 2026 hay números de la semilla; al hacer clic en
 *    *Facturado sin IVA* se abre el listado de esas facturas, con filas, y su
 *    total es el mismo número que tenía el tablero;
 * 3. lo mismo con *Pagado* y con *Cobrado*, los pendientes de cobro y de pago
 *    son los saldos que suman *Por cobrar* y *Por pagar*, y un mes inválido
 *    avisa y muestra el actual. Los números exactos de cada cifra, en pesos y
 *    en dólares, los afirma `tests/casos-uso/tablero.test.ts` dibujando la
 *    pantalla: acá la semilla comparte base con los otros recorridos y sus
 *    altas del día cambian los pendientes.
 *
 * Todo inventado (`@ejemplo.test`).
 */

import { expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";

/** Un número en cero no lleva a un listado con filas. */
const CERO = /^(ARS|USD) 0,00$/;

async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: email }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(email);
}

function mesDe(fecha: Date, desplazamiento: number): string {
  const anio = fecha.getFullYear();
  const total = anio * 12 + fecha.getMonth() + desplazamiento;
  const mes = (total % 12) + 1;
  return `${Math.floor(total / 12)}-${String(mes).padStart(2, "0")}`;
}

test("el inicio muestra el mes actual y navega al anterior y al siguiente", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  const hoy = new Date();

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  const actual = page.locator("[data-mes-actual]");
  await expect(actual).toHaveAttribute("data-mes-actual", mesDe(hoy, 0));
  await page.locator("[data-mes-anterior]").click();
  await expect(page).toHaveURL(new RegExp(`mes=${mesDe(hoy, -1)}`));
  await expect(actual).toHaveAttribute("data-mes-actual", mesDe(hoy, -1));
  await page.locator("[data-mes-siguiente]").click();
  await expect(actual).toHaveAttribute("data-mes-actual", mesDe(hoy, 0));
  await page.locator("[data-mes-siguiente]").click();
  await expect(actual).toHaveAttribute("data-mes-actual", mesDe(hoy, 1));
});

test("octubre de 2026 trae números de la semilla y cada uno lleva a un listado que suma lo mismo", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  await page.goto("/?mes=2026-10");
  await expect(page.locator("[data-mes-actual]")).toHaveAttribute(
    "data-mes-actual",
    "2026-10",
  );

  const facturado = page
    .locator('[data-cifra$="-facturado-sin-iva"]')
    .filter({ hasNotText: CERO })
    .first();
  const numeroFacturado = (await facturado.innerText()).trim();
  expect(numeroFacturado).toMatch(/^(ARS|USD) [0-9.]+,[0-9]{2}$/);
  await facturado.click();

  await expect(page).toHaveURL(/\/servicios\/facturas\?mes=2026-10&moneda=/);
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-total-sin-iva]")).toHaveText(
    `Sin IVA: ${numeroFacturado}`,
  );

  await page.goto("/?mes=2026-10");
  const pagado = page
    .locator('[data-cifra$="-pagado"]')
    .filter({ hasNotText: CERO })
    .first();
  const numeroPagado = (await pagado.innerText()).trim();
  await pagado.click();

  await expect(page).toHaveURL(/\/egresos\/pagos-hechos\?mes=2026-10&moneda=/);
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-total]")).toHaveText(
    `Total pagado: ${numeroPagado}`,
  );
});

test("octubre de 2026: Cobrado lleva al listado de cobros y los pendientes son los saldos de Por cobrar y Por pagar", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  await page.goto("/?mes=2026-10");
  const cobrado = page
    .locator('[data-cifra$="-cobrado"]')
    .filter({ hasNotText: CERO })
    .first();
  const numeroCobrado = (await cobrado.innerText()).trim();
  expect(numeroCobrado).toMatch(/^(ARS|USD) [0-9.]+,[0-9]{2}$/);
  await cobrado.click();

  await expect(page).toHaveURL(/\/servicios\/cobros\?mes=2026-10&moneda=/);
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-total]")).toHaveText(
    `Total cobrado: ${numeroCobrado}`,
  );

  for (const moneda of ["ARS", "USD"]) {
    await page.goto("/?mes=2026-10");
    const porCobrar = (
      await page.locator(`[data-cifra="${moneda}-por-cobrar"]`).innerText()
    ).trim();
    const porPagar = (
      await page.locator(`[data-cifra="${moneda}-por-pagar"]`).innerText()
    ).trim();

    await page.goto("/servicios/por-cobrar");
    await expect(page.locator("[data-saldos-por-moneda]")).toContainText(
      porCobrar,
    );
    await page.goto("/egresos/pagos");
    await expect(page.locator("[data-saldos-por-moneda]")).toContainText(
      porPagar,
    );
  }
});

test("un mes inválido avisa y muestra el actual", async ({ page }) => {
  await entrarComo(page, ADMIN);

  await page.goto("/?mes=2026-13");

  await expect(page.locator("[data-mes-invalido]")).toBeVisible();
  await expect(page.locator("[data-mes-actual]")).toHaveAttribute(
    "data-mes-actual",
    mesDe(new Date(), 0),
  );
});

/** Un egreso por la pantalla de egresos, como lo carga una persona. */
async function cargarEgreso(
  page: Page,
  datos: {
    readonly fecha: string;
    readonly concepto: string;
    readonly importe: string;
    readonly dolares?: string;
  },
): Promise<void> {
  await page.goto("/egresos");
  await page.getByRole("link", { name: "Alta de egreso" }).click();
  const ventana = page.getByRole("dialog", { name: "Alta de egreso" });
  await expect(ventana).toBeVisible();
  await page.getByLabel("Fecha", { exact: true }).fill(datos.fecha);
  await page.getByLabel("Concepto").fill(datos.concepto);
  await ventana
    .getByLabel("Centro de costo")
    .selectOption({ label: "Administración" });
  await page.getByLabel("Importe", { exact: true }).fill(datos.importe);
  if (datos.dolares !== undefined) {
    await page.getByLabel("Moneda de Importe").selectOption("USD");
    await page
      .getByLabel("Tipo de cambio (pesos por dólar)", { exact: true })
      .fill(datos.dolares);
    await page
      .getByLabel("Fuente de Tipo de cambio (pesos por dólar)")
      .fill("Cotización de ejemplo");
  }
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("el selector de moneda convierte cada documento con su tipo de cambio y avisa los que no tienen", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  // Marzo de 2029 no tiene nada de la semilla ni de los otros recorridos: un egreso
  // en dólares a 1.000,00 y otro en pesos que toma ese tipo de cambio.
  await cargarEgreso(page, {
    fecha: "2029-03-05",
    concepto: "Gasto en dólares de ejemplo",
    importe: "10,00",
    dolares: "1.000,00",
  });
  await cargarEgreso(page, {
    fecha: "2029-03-10",
    concepto: "Gasto en pesos de ejemplo",
    importe: "12.000,00",
  });

  await page.goto("/?mes=2029-03");
  await expect(page.locator('[data-selector-moneda="ARS"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator('[data-kpi="egresos"]')).toHaveText(
    "ARS 22.000,00",
  );
  await expect(page.locator('[data-kpi="facturacion"]')).toHaveText("ARS 0,00");
  await expect(page.locator("[data-sin-cambio]")).toHaveCount(0);

  await page.locator('[data-selector-moneda="USD"]').click();
  await expect(page).toHaveURL(/\/\?mes=2029-03&moneda=USD$/);
  await expect(page.locator('[data-selector-moneda="USD"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator('[data-kpi="egresos"]')).toHaveText("USD 22,00");
  await expect(page.locator("[data-nota-de-cambio]")).toHaveText(
    "Pesos convertidos con el último tipo de cambio cargado a esa fecha.",
  );
  // Las tarjetas de cada moneda no se convierten.
  await expect(page.locator('[data-cifra="ARS-egresos"]')).toHaveText(
    "ARS 12.000,00",
  );
  await expect(page.locator('[data-cifra="USD-egresos"]')).toHaveText(
    "USD 10,00",
  );

  // En dólares, los egresos en pesos anteriores a todo tipo de cambio quedan afuera y se cuentan aparte.
  const aviso = page.locator("[data-sin-cambio] a");
  await expect(aviso).toHaveText(/^[0-9]+ documentos? sin tipo de cambio$/);
  const cantidad = Number.parseInt(
    (await aviso.innerText()).split(" ")[0] ?? "",
    10,
  );
  await aviso.click();
  await expect(page).toHaveURL(/\/sin-tipo-de-cambio\?moneda=USD$/);
  await expect(
    page.getByRole("heading", { name: "Documentos sin tipo de cambio" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(cantidad);
  await expect(page.locator("tbody tr").first().getByRole("link")).toHaveText(
    /^(Factura|Egreso)$/,
  );
});
