/**
 * Egresos (F2-03, ADR 0032), en un navegador de verdad contra la imagen que se
 * publica. Lo recorre una operadora, que el administrador da de alta acá mismo:
 *
 * 1. ve los egresos de la semilla, lo más nuevo primero, con el importe en su
 *    moneda y las fechas como dd/mm/aaaa;
 * 2. da de alta uno con el monto mal escrito: el mensaje aparece al lado del
 *    campo y lo escrito (el monto, la moneda y lo demás) sigue en el
 *    formulario; lo corrige y se guarda;
 * 3. filtra por centro de costo y por mes;
 * 4. edita uno con el filtro puesto: el filtro se conserva;
 * 5. da de baja el que creó.
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos (la identidad falsa no ofrece más). Todo inventado.
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

function ventana(page: Page, titulo: string) {
  return page.getByRole("dialog", { name: titulo });
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("una operadora da de alta (con el monto mal escrito primero), filtra, edita y da de baja un egreso", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);
  await page.goto("/egresos");

  // 1. El listado de la semilla: lo más nuevo primero, el importe con su moneda.
  await expect(page.getByRole("heading", { name: "Egresos" })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(menu.getByRole("link", { name: "Egresos" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("row").nth(1)).toContainText("12/10/2026");
  await expect(page.getByRole("row").nth(1)).toContainText("ARS 180.000,00");
  await expect(fila(page, /Notebook para el equipo/)).toContainText(
    "USD 1.200,00",
  );
  await expect(fila(page, /Honorarios contables/)).toContainText("30/09/2026");

  // 2. Alta con el monto mal escrito: el mensaje al lado del campo y lo escrito conservado.
  await page.getByRole("link", { name: "Alta de egreso" }).click();
  await expect(ventana(page, "Alta de egreso")).toBeVisible();
  await page.getByLabel("Fecha", { exact: true }).fill("2026-11-05");
  await page.getByLabel("Concepto").fill("Alquiler de depósito");
  await ventana(page, "Alta de egreso")
    .getByLabel("Centro de costo")
    .selectOption({ label: "Administración" });
  await page.getByLabel("Importe", { exact: true }).fill("abc");
  await page.getByLabel("Moneda de Importe").selectOption("USD");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(
    ventana(page, "Alta de egreso").locator("[data-error-de-campo]"),
  ).toHaveText(/Escribí el importe con coma para los decimales/);
  await expect(
    page.getByLabel("Importe", { exact: true }),
  ).toHaveAccessibleDescription(/Escribí el importe/);
  await expect(page.getByLabel("Importe", { exact: true })).toHaveValue("abc");
  await expect(page.getByLabel("Moneda de Importe")).toHaveValue("USD");
  await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue(
    "2026-11-05",
  );
  await expect(page.getByLabel("Concepto")).toHaveValue("Alquiler de depósito");
  await expect(
    ventana(page, "Alta de egreso").getByLabel("Centro de costo"),
  ).toHaveValue(/.+/);

  await page.getByLabel("Importe", { exact: true }).fill("2.500,50");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, /Alquiler de depósito/)).toContainText("05/11/2026");
  await expect(fila(page, /Alquiler de depósito/)).toContainText(
    "USD 2.500,50",
  );
  // Es el más nuevo: queda primero.
  await expect(page.getByRole("row").nth(1)).toContainText(
    "Alquiler de depósito",
  );

  // 3. Filtro por mes y por centro de costo.
  await page.getByLabel("Mes").selectOption("2026-11");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/[?&]fecha=2026-11(&|$)/);
  await expect(fila(page, /Alquiler de depósito/)).toBeVisible();
  await expect(fila(page, /Combustible/)).toHaveCount(0);

  await page.getByLabel("Mes").selectOption("");
  await page.getByLabel("Centro de costo").selectOption({ label: "Vehículos" });
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/[?&]centroCostoId=/);
  await expect(fila(page, /Combustible/)).toHaveCount(2);
  await expect(fila(page, /Honorarios contables/)).toHaveCount(0);

  // 4. Edición con el filtro puesto: se conserva al guardar.
  await fila(page, /12\/10\/2026/)
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(ventana(page, "Edición de egreso")).toBeVisible();
  await expect(page).toHaveURL(/[?&]centroCostoId=/);
  await expect(page.getByLabel("Importe", { exact: true })).toHaveValue(
    "180.000,00",
  );
  await expect(page.getByLabel("Moneda de Importe")).toHaveValue("ARS");
  await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue(
    "2026-10-12",
  );
  await page.getByLabel("Concepto").fill("Combustible de octubre");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]centroCostoId=/);
  await expect(fila(page, /Combustible de octubre/)).toBeVisible();

  // 5. Baja del que se creó, con su confirmación.
  await page.goto("/egresos");
  await fila(page, /Alquiler de depósito/)
    .getByRole("link", { name: "Dar de baja" })
    .click();
  await expect(ventana(page, "Baja de egreso")).toContainText("USD 2.500,50");
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, /Alquiler de depósito/)).toHaveCount(0);
  await expect(page.locator("[data-codigo-error]")).toHaveCount(0);
});
