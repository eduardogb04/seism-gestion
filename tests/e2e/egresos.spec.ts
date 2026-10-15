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
 * 5. da de baja el que creó;
 * 6. entra a la pantalla de un egreso desde su fila del listado, donde están sus pagos;
 * 7. le baja el importe por debajo de lo pagado: el mensaje vuelve al lado del
 *    importe y lo escrito sigue en el formulario.
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos (la identidad falsa no ofrece más). Todo inventado.
 */

import { readFile } from "node:fs/promises";
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
  await expect(page.getByLabel("Fecha", { exact: true })).toHaveAttribute(
    "type",
    "date",
  );
  await expect(page.getByLabel("Vencimiento")).toHaveAttribute("type", "date");
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
  await expect(page.getByLabel("Fecha", { exact: true })).toHaveAttribute(
    "type",
    "date",
  );
  await expect(page.getByLabel("Vencimiento")).toHaveAttribute("type", "date");
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

  // 6. Cada fila lleva a la pantalla del egreso, con sus pagos.
  await page.goto("/egresos");
  await fila(page, /03\/09\/2026/)
    .getByRole("link", { name: "03/09/2026" })
    .click();
  await expect(page).toHaveURL(/\/egresos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Pagos" })).toBeVisible();
  await expect(page.getByText("ARS 150.000,00").first()).toBeVisible();

  // 7. Editar un egreso con pagos, por debajo de lo pagado: el mensaje al lado del importe.
  await page.goto("/egresos");
  await fila(page, /03\/09\/2026/)
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(ventana(page, "Edición de egreso")).toBeVisible();
  await page.getByLabel("Concepto").fill("Combustible de septiembre");
  await page.getByLabel("Importe", { exact: true }).fill("100.000,00");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(
    ventana(page, "Edición de egreso").locator("[data-error-de-campo]"),
  ).toHaveText(/lo ya pagado \(ARS 150\.000,00\)/);
  await expect(
    page.getByLabel("Importe", { exact: true }),
  ).toHaveAccessibleDescription(/lo ya pagado/);
  await expect(page.getByLabel("Importe", { exact: true })).toHaveValue(
    "100.000,00",
  );
  await expect(page.getByLabel("Concepto")).toHaveValue(
    "Combustible de septiembre",
  );
  await expect(page.locator("[data-codigo-error]")).toHaveCount(0);
});

const PDF_DE_EJEMPLO = Buffer.from("%PDF-1.4\nFactura de ejemplo\n");

test("un egreso de proyecto pide servicio y se guarda con su comprobante; uno de administración no lleva servicio", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);
  await page.goto("/egresos");
  await page.getByRole("link", { name: "Alta de egreso" }).click();
  const alta = ventana(page, "Alta de egreso");
  await alta.getByLabel("Fecha", { exact: true }).fill("2026-08-10");
  await alta.getByLabel("Concepto").fill("Repuestos para tanque");
  await alta
    .getByLabel("Centro de costo")
    .selectOption({ label: "Servicios a clientes" });
  await alta.getByLabel("Importe", { exact: true }).fill("7.500,00");

  // 1. De proyecto y sin servicio: el mensaje al lado del campo y lo escrito conservado.
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(alta.locator("[data-error-de-campo]")).toHaveText(
    /Un egreso de un centro de costo de proyecto tiene que decir de qué servicio es/,
  );
  await expect(
    alta.getByLabel("Servicio", { exact: true }),
  ).toHaveAccessibleDescription(/tiene que decir de qué servicio es/);
  await expect(alta.getByLabel("Concepto")).toHaveValue(
    "Repuestos para tanque",
  );
  await expect(alta.getByLabel("Centro de costo")).toHaveValue(/.+/);

  // 2. Con servicio (por código y título) y comprobante: se guarda.
  const servicio = alta.getByLabel("Servicio", { exact: true });
  const opcion = servicio.locator("option", {
    hasText: "Operación de tanques — ejemplo",
  });
  await expect(opcion).toHaveText(
    /^SRV-\d{4}-\d{3} · Operación de tanques — ejemplo$/,
  );
  await servicio.selectOption({ label: (await opcion.textContent()) ?? "" });
  await alta.getByLabel("Comprobante", { exact: true }).setInputFiles({
    name: "factura-ejemplo.pdf",
    mimeType: "application/pdf",
    buffer: PDF_DE_EJEMPLO,
  });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, /Repuestos para tanque/)).toContainText("10/08/2026");

  // 3. Se ve en la pantalla del servicio, con el total por moneda, y el comprobante se descarga.
  await page.goto("/servicios");
  await fila(page, /Operación de tanques — ejemplo/)
    .getByRole("link", { name: "Ver" })
    .click();
  await expect(page.getByRole("heading", { name: "Egresos" })).toBeVisible();
  await expect(fila(page, /Repuestos para tanque/)).toContainText(
    "ARS 7.500,00",
  );
  await expect(fila(page, /Repuestos para el servicio/)).toContainText(
    "ARS 325.000,00",
  );
  await expect(page.getByText("Total: ARS 332.500,00")).toBeVisible();
  await page.getByRole("link", { name: "Repuestos para tanque" }).click();
  await expect(page).toHaveURL(/\/egresos\/[0-9a-f-]{36}$/);
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /factura-ejemplo\.pdf/ }).click(),
  ]);
  expect(descarga.suggestedFilename()).toBe("factura-ejemplo.pdf");
  const archivo = await descarga.path();
  expect(archivo).not.toBeNull();
  expect((await readFile(archivo ?? "")).equals(PDF_DE_EJEMPLO)).toBe(true);

  // 4. De administración: con servicio se rechaza; sin servicio se guarda.
  await page.goto("/egresos");
  await page.getByRole("link", { name: "Alta de egreso" }).click();
  const otro = ventana(page, "Alta de egreso");
  await otro.getByLabel("Fecha", { exact: true }).fill("2026-08-11");
  await otro.getByLabel("Concepto").fill("Papelería de oficina");
  await otro
    .getByLabel("Centro de costo")
    .selectOption({ label: "Administración" });
  await otro.getByLabel("Importe", { exact: true }).fill("1.000,00");
  const elegido = otro.getByLabel("Servicio", { exact: true });
  await elegido.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(otro.locator("[data-error-de-campo]")).toHaveText(
    /Solo los egresos de centros de costo de proyecto llevan servicio/,
  );
  await elegido.selectOption({ label: "Ninguno" });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(fila(page, /Papelería de oficina/)).toContainText("11/08/2026");

  // Se dan de baja: *Por pagar* y los totales de las demás pruebas quedan como estaban.
  for (const concepto of [/Papelería de oficina/, /Repuestos para tanque/]) {
    await fila(page, concepto)
      .getByRole("link", { name: "Dar de baja" })
      .click();
    await page.getByRole("button", { name: "Confirmar baja" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(fila(page, concepto)).toHaveCount(0);
  }
});
