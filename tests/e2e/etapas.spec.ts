/**
 * La pantalla del servicio por etapa (F3-06), en un navegador de verdad contra
 * la imagen que se publica. Una operadora (que el administrador da de alta acá
 * mismo) lleva un servicio por Creado → Cotizado → Adjudicado → En ejecución →
 * Finalizado → Cerrado y en cada etapa se comprueba lo que se ve **y lo que no**:
 *
 * - la línea de etapas, con la actual marcada y las pasadas como enlaces;
 * - las secciones de la etapa, y que no está ninguna de las otras;
 * - los botones de transición, que piden confirmación;
 * - en «Adjudicado», elegir la modalidad mensual y ajustar la cuota con su aviso;
 * - una etapa pasada, en solo lectura, y una futura, que no se abre.
 *
 * Los sucesos se ven en una columna lateral en todas las etapas. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Recorrido por etapas de prueba — ejemplo";
/** El número de una orden y el de una factura no se repiten entre las vigentes: cada corrida usa los suyos. */
const ORDEN = `OC-E2E-ETAPAS-${Date.now()}`;
const FACTURA = `0000-E2E-ETAPAS-${Date.now()}`;

const SECCIONES = [
  "Sitios que abarca",
  "Cotizaciones",
  "Órdenes de compra",
  "Facturación",
  "Hitos",
  "Recursos",
  "Facturas",
  "Avance",
  "Egresos",
  "Vencimientos",
] as const;

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

/** Están las secciones que se pasan y ninguna de las otras; Sucesos, en la columna lateral, siempre. */
async function seVeSolo(
  page: Page,
  secciones: readonly (typeof SECCIONES)[number][],
): Promise<void> {
  for (const seccion of SECCIONES) {
    await expect(
      page.getByRole("heading", { name: seccion, exact: true }),
    ).toHaveCount(secciones.includes(seccion) ? 1 : 0);
  }
  await expect(
    page
      .getByRole("complementary", { name: "Registro de sucesos" })
      .getByRole("heading", { name: "Sucesos", exact: true }),
  ).toBeVisible();
}

async function transicionesOfrecidas(page: Page): Promise<readonly string[]> {
  return page
    .getByRole("region", { name: "Cambiar de etapa" })
    .getByRole("link")
    .allTextContents();
}

function etapa(page: Page, valor: string) {
  return page.locator(`[data-etapa="${valor}"]`);
}

/** Pasa a otra etapa con el botón y su confirmación. */
async function confirmar(page: Page, boton: string): Promise<void> {
  await page.getByRole("link", { name: boton, exact: true }).click();
  await ventana(page, boton).getByRole("button", { name: "Confirmar" }).click();
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("un servicio recorre todas las etapas y en cada una se ve solo lo suyo", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);
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
  const servicioUrl = page.url();
  const estado = page.locator("[data-estado-del-servicio]");

  // Creado: datos y cotización. Todavía no hay a dónde ir más que a cancelar.
  await expect(estado).toHaveText("Creado");
  await seVeSolo(page, ["Sitios que abarca", "Cotizaciones"]);
  await expect(etapa(page, "creado")).toHaveAttribute(
    "data-situacion",
    "actual",
  );
  await expect(etapa(page, "cotizado")).toHaveAttribute(
    "data-situacion",
    "futura",
  );
  await expect(
    page.getByRole("navigation", { name: "Etapas" }).getByRole("link"),
  ).toHaveCount(0);
  expect(await transicionesOfrecidas(page)).toEqual(["Pasar a «Cancelado»"]);

  // Cotizado: aclaraciones, nueva versión de la cotización y la orden de compra.
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
  await expect(estado).toHaveText("Cotizado");
  await seVeSolo(page, ["Cotizaciones", "Órdenes de compra"]);
  await expect(
    page.getByRole("link", { name: "Nueva cotización" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Nueva orden de compra" }),
  ).toBeVisible();
  await expect(etapa(page, "creado")).toHaveAttribute(
    "data-situacion",
    "recorrida",
  );
  expect(await transicionesOfrecidas(page)).toEqual([
    "Pasar a «Perdido»",
    "Pasar a «Sin respuesta»",
    "Pasar a «Cancelado»",
  ]);
  // Cada transición pide confirmación: abrirla y cerrarla no cambia nada.
  await page.getByRole("link", { name: "Pasar a «Perdido»" }).click();
  await expect(ventana(page, "Pasar a «Perdido»")).toBeVisible();
  await ventana(page, "Pasar a «Perdido»")
    .getByRole("link", { name: "Cerrar" })
    .click();
  await expect(ventana(page, "Pasar a «Perdido»")).toHaveCount(0);
  await expect(estado).toHaveText("Cotizado");

  // Un suceso en la columna lateral.
  await page.getByRole("link", { name: "Nuevo suceso" }).click();
  const suceso = ventana(page, "Nuevo suceso");
  await suceso.getByLabel("Qué pasó").fill("El cliente pidió una aclaración");
  await suceso.getByRole("button", { name: "Cargar" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Registro de sucesos" })
      .getByText("El cliente pidió una aclaración"),
  ).toBeVisible();

  // Adjudicado: la orden de compra, la modalidad y la planificación.
  await page.getByRole("link", { name: "Nueva orden de compra" }).click();
  const orden = ventana(page, "Nueva orden de compra");
  await orden.getByLabel("Número").fill(ORDEN);
  await orden.getByLabel("Fecha").fill("2026-10-12");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(estado).toHaveText("Adjudicado");
  await seVeSolo(page, [
    "Órdenes de compra",
    "Facturación",
    "Hitos",
    "Recursos",
    "Facturas",
    "Avance",
  ]);
  await expect(
    page.getByRole("link", { name: "Nueva orden de compra" }),
  ).toHaveCount(0);
  expect(await transicionesOfrecidas(page)).toEqual([
    "Iniciar ejecución",
    "Pasar a «Cancelado»",
  ]);

  await page.getByRole("link", { name: "Elegir la modalidad" }).click();
  const modalidad = ventana(page, "Modalidad de facturación");
  await modalidad
    .getByLabel("Modalidad de facturación")
    .selectOption({ label: "Mensual" });
  await modalidad.getByLabel(/^Cuota mensual sin IVA/).fill("100,00");
  await modalidad.getByLabel(/^Mes de inicio/).fill("2026-01-15");
  await modalidad.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator("[data-modalidad]")).toHaveText(
    "Modalidad: Mensual",
  );
  // Los cuatro números de la etapa, con la orden de 1.000,00 todavía sin facturar.
  const numeros = page.locator("[data-numeros-de-facturacion]");
  await expect(numeros.getByRole("heading")).toHaveText([
    /^Devengado a /,
    "Por facturar",
    "Saldo de la orden de compra",
    "Por cobrar (con IVA)",
  ]);
  await expect(numeros).toContainText("ARS 1.000,00");

  // Ajustar la cuota: la ventana se abre con ?ajusteDeCuota=1 y avisa desde cuándo vale.
  await page.getByRole("link", { name: "Ajustar la cuota" }).click();
  await expect(page).toHaveURL(/[?&]ajusteDeCuota=1$/);
  const ajuste = ventana(page, "Ajustar la cuota");
  await expect(ajuste.locator("[data-aviso-de-ajuste]")).toBeVisible();
  await ajuste.getByLabel(/^Cuota mensual sin IVA/).fill("150,00");
  await ajuste.getByLabel("Rige desde").fill("2099-03-10");
  await expect(ajuste.locator("[data-aviso-de-ajuste]")).toHaveText(
    "El cambio vale desde marzo de 2099 en adelante; no cambia lo ya devengado.",
  );
  await ajuste.getByRole("button", { name: "Confirmar ajuste" }).click();
  await expect(ventana(page, "Ajustar la cuota")).toHaveCount(0);
  await expect(
    page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Rige desde" }) })
      .getByRole("row"),
  ).toHaveCount(3);

  // Para facturar de una vez al final: sin facturas todavía, se cambia a puntual.
  await page.getByRole("link", { name: "Cambiar la modalidad" }).click();
  await ventana(page, "Modalidad de facturación")
    .getByLabel("Modalidad de facturación")
    .selectOption({ label: "Puntual" });
  await ventana(page, "Modalidad de facturación")
    .getByRole("button", { name: "Guardar" })
    .click();
  await expect(page.locator("[data-modalidad]")).toHaveText(
    "Modalidad: Puntual",
  );

  // Una etapa pasada se mira en solo lectura; una futura o inválida no se abre.
  await etapa(page, "cotizado").getByRole("link").click();
  await expect(page).toHaveURL(/[?&]etapa=cotizado$/);
  await expect(page.locator("[data-solo-lectura]")).toContainText(
    "Solo lectura",
  );
  await seVeSolo(page, ["Cotizaciones", "Órdenes de compra"]);
  for (const enlace of [
    "Nueva cotización",
    "Nueva orden de compra",
    "Nuevo suceso",
    "Nuevo vencimiento",
    "Editar",
    "Dar de baja",
    "Iniciar ejecución",
    "Pasar a «Cancelado»",
  ]) {
    await expect(page.getByRole("link", { name: enlace })).toHaveCount(0);
  }
  await page.getByRole("link", { name: "Volver a la etapa actual" }).click();
  await expect(page).toHaveURL(servicioUrl);
  for (const destino of ["cerrado", "cualquier-cosa"]) {
    await page.goto(`${servicioUrl}?etapa=${destino}`);
    await expect(page.locator("[data-solo-lectura]")).toHaveCount(0);
    await expect(estado).toHaveText("Adjudicado");
    await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();
  }

  // En ejecución: la operación.
  await page.goto(servicioUrl);
  await confirmar(page, "Iniciar ejecución");
  await expect(estado).toHaveText("En ejecución");
  await seVeSolo(page, [
    "Facturación",
    "Hitos",
    "Recursos",
    "Facturas",
    "Avance",
    "Egresos",
  ]);
  expect(await transicionesOfrecidas(page)).toEqual([
    "Finalizar servicio",
    "Pasar a «Cancelado»",
  ]);

  // Finalizado: lo que falta facturar y cobrar. Puntual devenga el total de la orden.
  await confirmar(page, "Finalizar servicio");
  await expect(estado).toHaveText("Finalizado");
  await seVeSolo(page, [
    "Facturación",
    "Facturas",
    "Avance",
    "Egresos",
    "Vencimientos",
  ]);
  expect(await transicionesOfrecidas(page)).toEqual([]);
  await page.getByRole("link", { name: "Nueva factura" }).click();
  const factura = ventana(page, "Nueva factura");
  await factura.getByLabel("Número").fill(FACTURA);
  await factura.getByLabel("Fecha", { exact: true }).fill("2026-10-20");
  await factura.getByLabel("Vencimiento").fill("2026-11-20");
  await factura.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await factura
    .getByLabel("Orden de compra")
    .selectOption({ label: `${ORDEN} · ARS 1.000,00` });
  await factura.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva factura")).toHaveCount(0);
  await expect(
    page.locator("[data-numeros-de-facturacion] article").first(),
  ).toContainText("ARS 1.000,00");

  // Cobrar todo lo facturado cierra el servicio, que queda en solo lectura.
  await page.getByRole("link", { name: "Cobrar", exact: true }).click();
  const cobro = ventana(page, "Cobrar factura");
  await cobro.getByLabel("Fecha").fill("2026-10-22");
  await cobro.getByLabel(/^Importe \(/).fill("1.210,00");
  await cobro
    .getByLabel("Cuenta", { exact: true })
    .selectOption({ label: "Caja · ARS" });
  await cobro.getByRole("button", { name: "Cobrar" }).click();
  await expect(estado).toHaveText("Cerrado");
  await seVeSolo(page, [
    "Facturación",
    "Facturas",
    "Avance",
    "Egresos",
    "Vencimientos",
  ]);
  await expect(page.locator("[data-solo-lectura]")).toHaveCount(0);
  for (const enlace of [
    "Nueva factura",
    "Cobrar",
    "Nuevo suceso",
    "Editar",
    "Elegir la modalidad",
    "Cambiar la modalidad",
  ]) {
    await expect(
      page.getByRole("link", { name: enlace, exact: true }),
    ).toHaveCount(0);
  }
  expect(await transicionesOfrecidas(page)).toEqual([]);
  await expect(
    page.locator("[data-etapa]:not([data-situacion='actual']) a"),
  ).toHaveCount(5);
});
