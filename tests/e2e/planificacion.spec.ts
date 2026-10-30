/**
 * Planificación y ejecución de un servicio (F3-02), en un navegador de verdad
 * contra la imagen que se publica. Lo recorre una operadora, que el
 * administrador da de alta acá mismo, sobre un servicio que ella lleva a
 * «Adjudicado» con una cotización y una orden de compra:
 *
 * 1. carga un hito y un recurso camión del ABM; en «Adjudicado» el hito no se
 *    puede tildar;
 * 2. elige la modalidad e inicia la ejecución sin haber cargado nada más: se puede;
 * 3. tilda el hito y ve la fecha y quién lo tildó.
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Planificación de prueba — ejemplo";

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

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("una operadora carga un hito y un camión en «Adjudicado», inicia la ejecución sin nada más y tilda el hito con su fecha", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);

  // Un servicio nuevo que llega a «Adjudicado» por su cotización y su orden de compra.
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
  await orden.getByLabel("Número").fill("OC-E2E-PLAN");
  await orden.getByLabel("Fecha").fill("2026-10-12");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva orden de compra")).toHaveCount(0);
  const estado = page.locator("[data-estado-del-servicio]");
  await expect(estado).toHaveText("Adjudicado");

  // 1. Un hito y un camión. Todavía no se puede tildar.
  await page.getByRole("link", { name: "Nuevo hito" }).click();
  const hito = ventana(page, "Nuevo hito");
  await hito.getByLabel("Hito").fill("Entrega del informe de arranque");
  await hito.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Nuevo hito")).toHaveCount(0);
  const filaDelHito = page.locator(
    '[data-hito="Entrega del informe de arranque"]',
  );
  await expect(filaDelHito.locator("[data-hito-realizado]")).toHaveText("No");
  await expect(filaDelHito.getByRole("button", { name: "Tildar" })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Nuevo recurso" }).click();
  const recurso = ventana(page, "Nuevo recurso");
  await recurso.getByLabel("Tipo", { exact: true }).selectOption("camion");
  await recurso.getByLabel("Camión").selectOption({ label: "ZZ001ZZ" });
  await recurso.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Nuevo recurso")).toHaveCount(0);
  await expect(
    page.getByRole("row", { name: /Camión\s+ZZ001ZZ/ }),
  ).toBeVisible();

  // 2. Iniciar la ejecución solo exige la modalidad de facturación, no hitos ni recursos.
  await page.getByRole("link", { name: /^Puntual/ }).click();
  const modalidad = ventana(page, "Modalidad de facturación");
  await modalidad
    .getByLabel("Modalidad de facturación")
    .selectOption({ label: "Puntual" });
  await modalidad.getByRole("button", { name: "Guardar" }).click();
  await expect(ventana(page, "Modalidad de facturación")).toHaveCount(0);
  await page.getByRole("link", { name: "Iniciar ejecución" }).click();
  await ventana(page, "Iniciar ejecución")
    .getByRole("button", { name: "Confirmar" })
    .click();
  await expect(estado).toHaveText("En ejecución");

  // 3. Ahora sí: se tilda, con la fecha y quién.
  await filaDelHito.getByRole("button", { name: "Tildar" }).click();
  await expect(filaDelHito.locator("[data-hito-realizado]")).toHaveText(
    new RegExp(`^\\d{2}/\\d{2}/\\d{4} · ${OPERADORA}$`),
  );
  await expect(
    filaDelHito.getByRole("button", { name: "Destildar" }),
  ).toBeVisible();
});
