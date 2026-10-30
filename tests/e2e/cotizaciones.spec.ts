/**
 * Cotizaciones de un servicio y su documento adjunto (F2-05, ADR 0035), en un
 * navegador de verdad contra la imagen que se publica. Lo recorre una operadora,
 * que el administrador da de alta acá mismo, sobre un servicio que ella crea:
 *
 * 1. carga la primera cotización con un archivo de ~2 MB (pasa el tope de 1 MB
 *    que traían las Server Actions): no pide motivo, el servicio pasa a
 *    «Cotizado» y el cambio queda en el historial;
 * 2. la segunda sin motivo vuelve con el mensaje al lado del campo y conserva el
 *    importe; con motivo entra, arriba de la primera;
 * 3. un archivo de tipo no admitido vuelve con su mensaje y conserva lo escrito;
 * 4. descarga el documento y los bytes son los que subió; sin sesión no se baja.
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos. Todo inventado.
 */

import { readFile } from "node:fs/promises";
import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Cotización de prueba — ejemplo";

/** Un PDF mínimo seguido de relleno: ~2 MB, más de lo que dejaba pasar Next por defecto. */
const PDF_DE_DOS_MB = Buffer.concat([
  Buffer.from("%PDF-1.4\nCotizacion de ejemplo\n"),
  Buffer.alloc(2 * 1024 * 1024, 0x20),
]);

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

/** La tabla de cotizaciones: la que tiene la columna «Motivo de la revisión». */
/** La línea de versiones del panel de «Cotizado» (F6-01): la más nueva arriba. */
function versiones(page: Page) {
  return page
    .getByRole("list", { name: "Versiones de la cotización" })
    .getByRole("listitem");
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("una operadora carga una cotización con su archivo, una segunda versión con motivo, y descarga el documento", async ({
  page,
  browser,
  baseURL,
}) => {
  await entrarComo(page, OPERADORA);

  // Un servicio nuevo, «Creado». Su pedido es más viejo que el de Servicios, que mira quién queda primero.
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
  const estado = page.locator("[data-estado-del-servicio]");
  await expect(estado).toHaveText("Creado");
  await expect(
    page.locator("[data-control]").filter({ hasText: "Cotización" }),
  ).toContainText("falta cargar");

  // 1. La primera: sin motivo, con un archivo de ~2 MB.
  await page.getByRole("link", { name: "Cargar cotización" }).click();
  const nueva = ventana(page, "Nueva cotización");
  await expect(nueva.getByLabel("Fecha")).toHaveAttribute("type", "date");
  await expect(nueva.getByLabel("Fecha")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(nueva.getByLabel("Motivo de la revisión")).toHaveCount(0);
  await expect(nueva.getByLabel("Documento")).toHaveAttribute(
    "accept",
    /\.pdf.*\.docx.*\.xlsx.*\.jpg.*\.png/,
  );
  await nueva.getByLabel("Fecha").fill("2026-10-12");
  await nueva.getByLabel("Importe", { exact: true }).fill("12.500,00");
  await nueva.getByLabel("Observaciones").fill("Sin flete de ejemplo");
  await nueva.getByLabel("Documento").setInputFiles({
    name: "cotizacion-v1.pdf",
    mimeType: "application/pdf",
    buffer: PDF_DE_DOS_MB,
  });
  await nueva.getByRole("button", { name: "Cargar" }).click();

  await expect(estado).toHaveText("Cotizado");
  const primera = versiones(page).first();
  await expect(primera).toContainText("v1 · ARS 12.500,00");
  await expect(primera).toContainText("12/10/2026");
  await expect(primera).toContainText(`Primera cotización · ${OPERADORA}`);
  await expect(primera).toContainText("Sin flete de ejemplo");
  await expect(primera).toContainText("cotizacion-v1.pdf (2,0 MB)");
  await page.getByText("Historial de estados").click();
  const historial = page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: "Quién" }) });
  const cambio = historial.getByRole("row").nth(1);
  await expect(cambio.getByRole("cell").nth(2)).toHaveText("Cotizado");
  await expect(cambio.getByRole("cell").nth(5)).toHaveText(
    "Cotización v1 cargada",
  );

  // 2. La segunda pide el motivo: sin él vuelve al lado del campo y conserva el importe.
  await page.getByRole("link", { name: "Nueva versión" }).click();
  const segunda = ventana(page, "Nueva cotización");
  await segunda.getByLabel("Importe", { exact: true }).fill("11.800,50");
  await segunda.getByLabel("Moneda de Importe").selectOption("USD");
  await segunda.getByLabel("Documento").setInputFiles({
    name: "cotizacion-v2.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nSegunda version de ejemplo\n"),
  });
  await segunda.getByRole("button", { name: "Cargar" }).click();
  await expect(
    segunda.getByLabel("Motivo de la revisión"),
  ).toHaveAccessibleDescription("Escribí el motivo de la revisión.");
  await expect(segunda.getByLabel("Importe", { exact: true })).toHaveValue(
    "11.800,50",
  );
  await expect(segunda.getByLabel("Moneda de Importe")).toHaveValue("USD");

  // 3. Un archivo de un tipo no admitido: su mensaje, al lado del campo, y lo escrito se conserva.
  await segunda
    .getByLabel("Motivo de la revisión")
    .fill("Ajuste de alcance de ejemplo");
  await segunda.getByLabel("Documento").setInputFiles({
    name: "programa.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("MZ no es un documento"),
  });
  await segunda.getByRole("button", { name: "Cargar" }).click();
  await expect(segunda.getByLabel("Documento")).toHaveAccessibleDescription(
    /Solo se admiten PDF, Word, Excel, JPG o PNG\. Volvé a elegir el archivo/,
  );
  await expect(segunda.getByLabel("Motivo de la revisión")).toHaveValue(
    "Ajuste de alcance de ejemplo",
  );
  await expect(segunda.getByLabel("Importe", { exact: true })).toHaveValue(
    "11.800,50",
  );

  // La segunda, con motivo y un archivo bueno, entra arriba de la primera.
  await segunda.getByLabel("Documento").setInputFiles({
    name: "cotizacion-v2.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nSegunda version de ejemplo\n"),
  });
  await segunda.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva cotización")).toHaveCount(0);
  await expect(versiones(page)).toHaveCount(2);
  const arriba = versiones(page).first();
  await expect(arriba).toContainText("v2 · USD 11.800,50");
  await expect(arriba).toContainText("Ajuste de alcance de ejemplo");
  await expect(arriba.locator("[data-vigente]")).toHaveText("vigente");
  await expect(versiones(page).nth(1).locator("[data-vigente]")).toHaveCount(0);
  await expect(estado).toHaveText("Cotizado");
  await expect(historial.getByRole("row")).toHaveCount(3);

  // 4. La descarga trae los mismos bytes; sin sesión no se baja.
  const enlace = versiones(page)
    .nth(1)
    .getByRole("link", { name: /cotizacion-v1\.pdf/ });
  const ruta = await enlace.getAttribute("href");
  expect(ruta).toMatch(/^\/documentos\/[0-9a-f-]{36}$/);
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    enlace.click(),
  ]);
  expect(descarga.suggestedFilename()).toBe("cotizacion-v1.pdf");
  const archivo = await descarga.path();
  expect(archivo).not.toBeNull();
  expect((await readFile(archivo ?? "")).equals(PDF_DE_DOS_MB)).toBe(true);

  const sinSesion = await browser.newContext(
    baseURL === undefined ? {} : { baseURL },
  );
  const respuesta = await sinSesion.request.get(ruta ?? "");
  expect(respuesta.status()).toBe(401);
  expect(await respuesta.body()).toHaveLength(0);
  await sinSesion.close();
});
