/**
 * El servicio en un panel propio por etapa (F3-06; F6-01, ADR 0048), en un
 * navegador de verdad contra la imagen que se publica. Una operadora (que el
 * administrador da de alta acá mismo) lleva un servicio por Creado → Cotizado →
 * Adjudicado → En ejecución → Finalizado → Cerrado y en cada etapa se comprueba
 * lo que se ve **y lo que no**:
 *
 * - la ruta de la etapa (`/servicios/<id>/<etapa>`), y que el listado entra ahí;
 * - la línea de etapas, con la actual marcada y las recorridas como enlaces;
 * - el panel de «Creado» (cliente, lista de control) y el de «Cotizado»
 *   (métricas y línea de versiones, sin nada de la orden de compra ni de la
 *   facturación);
 * - las secciones de las etapas siguientes, y que no está ninguna de las otras;
 * - los botones de transición, que piden confirmación;
 * - en «Adjudicado», elegir la modalidad mensual y ajustar la cuota con su aviso;
 * - una etapa recorrida, en solo lectura, y una futura, que redirige a la actual.
 *
 * Las observaciones y sucesos se ven en una columna lateral en todas las
 * etapas. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Recorrido por etapas de prueba — ejemplo";
/** El número de una orden y el de una factura no se repiten entre las vigentes: cada corrida usa los suyos. */
const ORDEN = `OC-E2E-ETAPAS-${Date.now()}`;
const FACTURA = `0000-E2E-ETAPAS-${Date.now()}`;

const SECCIONES = [
  "Preparar la cotización",
  "Sitios que abarca",
  "Esperando respuesta del cliente",
  "Versiones de la cotización",
  "Documentación de alcance",
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

/** Están las secciones que se pasan y ninguna de las otras; la columna de sucesos, siempre. */
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
    lateral(page).getByRole("heading", {
      name: "Observaciones y sucesos",
      exact: true,
    }),
  ).toBeVisible();
}

function lateral(page: Page) {
  return page.getByRole("complementary", { name: "Observaciones y sucesos" });
}

async function transicionesOfrecidas(page: Page): Promise<readonly string[]> {
  return page
    .getByRole("region", { name: "Cambiar de etapa" })
    .getByRole("link")
    .allTextContents();
}

/** La sección «Documentación de alcance». */
function alcance(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Documentación de alcance",
      exact: true,
    }),
  });
}

function etapa(page: Page, valor: string) {
  return page.locator(`[data-etapa="${valor}"]`);
}

/** Pasa a otra etapa con el botón y su confirmación. */
async function confirmar(page: Page, boton: string): Promise<void> {
  await page.getByRole("link", { name: boton, exact: true }).click();
  await ventana(page, boton).getByRole("button", { name: "Confirmar" }).click();
}

/** Da de alta un servicio de ejemplo y deja la pantalla en su panel de «Creado». */
async function altaDeServicio(page: Page, titulo: string): Promise<void> {
  await page.goto("/servicios");
  await page.getByRole("link", { name: "Alta de servicio" }).click();
  const alta = ventana(page, "Alta de servicio");
  await alta
    .getByLabel("Cliente")
    .selectOption({ label: "Empresa Ejemplo Uno S.A." });
  await alta
    .getByLabel("Tipo de servicio")
    .selectOption({ label: "Logística" });
  await alta.getByLabel("Título").fill(titulo);
  await alta.getByLabel("Responsable").selectOption({ label: ADMIN });
  await alta.getByLabel("Fecha de pedido").fill("2026-10-10");
  await alta.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}\/creado$/);
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("un servicio recorre todas las etapas y cada una tiene su panel", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);
  await altaDeServicio(page, TITULO);
  // La ruta del servicio, sin la etapa.
  const servicioUrl = page.url().replace(/\/creado$/, "");
  const estado = page.locator("[data-estado-del-servicio]");

  // Creado: preparar la cotización. Los datos del cliente y lo que falta.
  await expect(estado).toHaveText("Creado");
  await seVeSolo(page, [
    "Preparar la cotización",
    "Sitios que abarca",
    "Documentación de alcance",
  ]);
  await expect(
    // La tarjeta de la razón social: el padre de su título.
    page.getByRole("heading", { name: "Razón social" }).locator(".."),
  ).toContainText("Empresa Ejemplo Uno S.A.");
  const control = page.getByRole("list", { name: "Para cotizar" });
  await expect(control.getByRole("listitem")).toHaveText([
    /^Hecho:Datos iniciales\s*completos$/,
    /^Pendiente:Sitios\s*ninguno marcado$/,
    /^Pendiente:Documentación de alcance\s*sin archivos$/,
    /^Pendiente:Cotización\s*falta cargar$/,
  ]);
  await expect(etapa(page, "creado")).toHaveAttribute(
    "data-situacion",
    "actual",
  );
  await expect(etapa(page, "cotizado")).toHaveAttribute(
    "data-situacion",
    "futura",
  );
  // Solo la actual tiene enlace: no hay recorridas todavía.
  await expect(
    page.getByRole("navigation", { name: "Etapas" }).getByRole("link"),
  ).toHaveCount(1);
  expect(await transicionesOfrecidas(page)).toEqual(["Pasar a «Cancelado»"]);

  // Un documento de alcance se sube desde la barra y se ve en su sección y en la lista.
  await page.getByRole("link", { name: "Subir documento de alcance" }).click();
  await ventana(page, "Nuevo documento de alcance")
    .getByLabel("Documento")
    .setInputFiles({
      name: "alcance.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nAlcance de ejemplo\n"),
    });
  await ventana(page, "Nuevo documento de alcance")
    .getByRole("button", { name: "Cargar" })
    .click();
  await expect(ventana(page, "Nuevo documento de alcance")).toHaveCount(0);
  await expect(
    alcance(page).getByRole("link", { name: /^alcance.pdf/ }),
  ).toBeVisible();
  await expect(control.getByRole("listitem").nth(2)).toHaveText(
    /^Hecho:Documentación de alcance\s*1 archivo$/,
  );

  // Cotizado: la acción principal de «Creado» carga la cotización y lleva a su panel.
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
  await expect(estado).toHaveText("Cotizado");
  await expect(page).toHaveURL(`${servicioUrl}/cotizado`);

  // Una segunda versión, con su motivo: la vigente es la nueva.
  await page.getByRole("link", { name: "Nueva versión" }).click();
  const version = ventana(page, "Nueva cotización");
  await version.getByLabel("Fecha").fill("2026-10-13");
  await version.getByLabel("Importe", { exact: true }).fill("900,00");
  await version
    .getByLabel("Motivo de la revisión")
    .fill("El cliente pidió un ajuste de ejemplo");
  await version.getByLabel("Documento").setInputFiles({
    name: "cotizacion-v2.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nSegunda versión de ejemplo\n"),
  });
  await version.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nueva cotización")).toHaveCount(0);

  // Las métricas, la línea de versiones y nada de la orden de compra ni de la facturación.
  await seVeSolo(page, [
    "Esperando respuesta del cliente",
    "Versiones de la cotización",
    "Documentación de alcance",
  ]);
  const metricas = page.locator("[data-metricas-de-cotizado] article");
  await expect(metricas.getByRole("heading")).toHaveText([
    "Cotización vigente",
    "Días desde que se cotizó",
    "Versiones",
  ]);
  await expect(metricas.nth(0)).toContainText("ARS 900,00");
  await expect(metricas.nth(0)).toContainText("versión 2 · 13/10/2026");
  await expect(metricas.nth(1)).toContainText(/\d+/);
  await expect(metricas.nth(2)).toContainText("2");
  await expect(metricas.nth(2)).toContainText(/[-−]10\s%\ssobre la v1/);
  const versiones = page
    .getByRole("list", { name: "Versiones de la cotización" })
    .getByRole("listitem");
  await expect(versiones).toHaveCount(2);
  await expect(versiones.nth(0)).toContainText("v2 · ARS 900,00");
  await expect(versiones.nth(0)).toContainText(
    `El cliente pidió un ajuste de ejemplo · ${OPERADORA}`,
  );
  await expect(versiones.nth(0).locator("[data-vigente]")).toHaveText(
    "vigente",
  );
  await expect(versiones.nth(1)).toContainText("v1 · ARS 1.000,00");
  await expect(versiones.nth(1)).toContainText("11/10/2026");
  await expect(versiones.nth(1)).toContainText(
    `Primera cotización · ${OPERADORA}`,
  );
  await expect(versiones.nth(1).locator("[data-vigente]")).toHaveCount(0);
  for (const deOtraEtapa of [
    "[data-modalidad]",
    "[data-numeros-de-facturacion]",
  ]) {
    await expect(page.locator(deOtraEtapa)).toHaveCount(0);
  }
  for (const enlace of ["Elegir la modalidad", "Nueva factura"]) {
    await expect(page.getByRole("link", { name: enlace })).toHaveCount(0);
  }
  await expect(
    alcance(page).getByRole("link", { name: /^alcance.pdf/ }),
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
  await expect(page).toHaveURL(`${servicioUrl}/cotizado?pasar=perdido`);
  await expect(ventana(page, "Pasar a «Perdido»")).toBeVisible();
  await ventana(page, "Pasar a «Perdido»")
    .getByRole("link", { name: "Cerrar" })
    .click();
  await expect(ventana(page, "Pasar a «Perdido»")).toHaveCount(0);
  await expect(estado).toHaveText("Cotizado");

  // Un suceso con tipo en la columna lateral, con su etiqueta; sin tipo es una observación.
  await page.getByRole("link", { name: "Nuevo suceso" }).click();
  const suceso = ventana(page, "Nuevo suceso");
  await expect(suceso.getByLabel("Tipo")).toHaveValue("observacion");
  await suceso.getByLabel("Tipo").selectOption({ label: "Hallazgo" });
  await suceso.getByLabel("Qué pasó").fill("Se vio corrosión de ejemplo");
  await suceso.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nuevo suceso")).toHaveCount(0);
  await page.getByRole("link", { name: "Nuevo suceso" }).click();
  await ventana(page, "Nuevo suceso")
    .getByLabel("Tipo")
    .selectOption({ label: "Ninguna" });
  await ventana(page, "Nuevo suceso")
    .getByLabel("Qué pasó")
    .fill("El cliente pidió una aclaración");
  await ventana(page, "Nuevo suceso")
    .getByRole("button", { name: "Cargar" })
    .click();
  await expect(ventana(page, "Nuevo suceso")).toHaveCount(0);
  const sucesos = lateral(page).locator("[data-suceso]");
  await expect(
    sucesos.filter({ hasText: "Se vio corrosión de ejemplo" }),
  ).toContainText("Hallazgo");
  await expect(
    sucesos.filter({ hasText: "El cliente pidió una aclaración" }),
  ).toContainText("Observación");

  // «Creado», desde la línea de etapas: en solo lectura, con el aviso y la vuelta.
  await etapa(page, "creado").getByRole("link").click();
  await expect(page).toHaveURL(`${servicioUrl}/creado`);
  await expect(page.locator("[data-solo-lectura]")).toContainText(
    "Solo lectura",
  );
  await expect(
    page.getByRole("heading", { name: "Preparar la cotización" }),
  ).toBeVisible();
  await expect(page.getByLabel("Planta Ejemplo Norte")).toBeDisabled();
  for (const enlace of [
    "Cargar cotización",
    "Subir documento de alcance",
    "Pasar a «Cancelado»",
  ]) {
    await expect(page.getByRole("link", { name: enlace })).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: "Guardar sitios" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Volver a la etapa actual" }).click();
  await expect(page).toHaveURL(`${servicioUrl}/cotizado`);

  // Una etapa futura redirige a la actual; `/servicios/<id>` también.
  for (const destino of ["/adjudicado", "/cerrado", "/salida", ""]) {
    await page.goto(`${servicioUrl}${destino}`);
    await expect(page).toHaveURL(`${servicioUrl}/cotizado`);
    await expect(page.locator("[data-solo-lectura]")).toHaveCount(0);
  }

  // El listado entra directo al panel de la etapa.
  await page.goto(`/servicios?buscar=${encodeURIComponent(TITULO)}`);
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: TITULO, exact: true }) })
    .getByRole("link", { name: "Ver" })
    .click();
  await expect(page).toHaveURL(`${servicioUrl}/cotizado`);

  // Adjudicado: la orden de compra es la acción principal de «Cotizado».
  await page.getByRole("link", { name: "Cargar orden de compra" }).click();
  const orden = ventana(page, "Nueva orden de compra");
  await orden.getByLabel("Número").fill(ORDEN);
  await orden.getByLabel("Fecha").fill("2026-10-12");
  await orden.getByLabel("Importe sin IVA", { exact: true }).fill("1.000,00");
  await orden.getByRole("button", { name: "Cargar" }).click();
  await expect(estado).toHaveText("Adjudicado");
  await expect(page).toHaveURL(`${servicioUrl}/adjudicado`);
  await seVeSolo(page, [
    "Órdenes de compra",
    "Facturación",
    "Hitos",
    "Recursos",
    "Facturas",
    "Avance",
  ]);
  await expect(
    page.getByRole("link", { name: "Cargar orden de compra" }),
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
  await expect(page).toHaveURL(/\/adjudicado\?ajusteDeCuota=1$/);
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

  // «Cotizado», ya recorrido, en solo lectura: sus versiones sin nada que cargar ni cambiar.
  await etapa(page, "cotizado").getByRole("link").click();
  await expect(page).toHaveURL(`${servicioUrl}/cotizado`);
  await expect(page.locator("[data-solo-lectura]")).toContainText(
    "Solo lectura",
  );
  await seVeSolo(page, [
    "Esperando respuesta del cliente",
    "Versiones de la cotización",
    "Documentación de alcance",
  ]);
  for (const enlace of [
    "Cargar orden de compra",
    "Nueva versión",
    "Subir documento de alcance",
    "Iniciar ejecución",
    "Pasar a «Cancelado»",
  ]) {
    await expect(page.getByRole("link", { name: enlace })).toHaveCount(0);
  }
  await expect(
    page
      .getByRole("list", { name: "Versiones de la cotización" })
      .getByRole("link", { name: "Anular" }),
  ).toHaveCount(0);
  // Pedir una ventana sobre una etapa recorrida no la abre.
  await page.goto(`${servicioUrl}/cotizado?pasar=perdido`);
  await expect(ventana(page, "Pasar a «Perdido»")).toHaveCount(0);
  await page.getByRole("link", { name: "Volver a la etapa actual" }).click();
  await expect(page).toHaveURL(`${servicioUrl}/adjudicado`);
  await expect(page.locator("[data-solo-lectura]")).toHaveCount(0);

  // En ejecución: la operación.
  await confirmar(page, "Iniciar ejecución");
  await expect(estado).toHaveText("En ejecución");
  await expect(page).toHaveURL(`${servicioUrl}/en-ejecucion`);
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
  await expect(page).toHaveURL(`${servicioUrl}/finalizado`);
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
  await expect(page).toHaveURL(`${servicioUrl}/cerrado`);
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

const CIERRES = [
  { estado: "Perdido", cotizado: true, motivo: "Eligió a otro proveedor" },
  { estado: "Sin respuesta", cotizado: true, motivo: "No contestó en un mes" },
  { estado: "Cancelado", cotizado: false, motivo: "El cliente desistió" },
] as const;

for (const { estado, cotizado, motivo } of CIERRES) {
  test(`un servicio «${estado}» se ve en solo lectura, con su cierre y sus cotizaciones`, async ({
    page,
  }) => {
    await entrarComo(page, OPERADORA);
    await altaDeServicio(page, `${TITULO} · ${estado}`);
    if (cotizado) {
      await page.getByRole("link", { name: "Cargar cotización" }).click();
      const cotizacion = ventana(page, "Nueva cotización");
      await cotizacion.getByLabel("Fecha").fill("2026-10-11");
      await cotizacion.getByLabel("Importe", { exact: true }).fill("1.000,00");
      await cotizacion.getByLabel("Documento").setInputFiles({
        name: "cotizacion-cerrada.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nCotización de ejemplo\n"),
      });
      await cotizacion.getByRole("button", { name: "Cargar" }).click();
    }
    await expect(page.locator("[data-estado-del-servicio]")).toHaveText(
      cotizado ? "Cotizado" : "Creado",
    );
    await page.getByRole("link", { name: `Pasar a «${estado}»` }).click();
    await ventana(page, `Pasar a «${estado}»`)
      .getByLabel("Nota o motivo")
      .fill(motivo);
    await ventana(page, `Pasar a «${estado}»`)
      .getByRole("button", { name: "Confirmar" })
      .click();

    await expect(page.locator("[data-estado-del-servicio]")).toHaveText(estado);
    await expect(page).toHaveURL(/\/salida$/);
    await seVeSolo(page, ["Cotizaciones"]);
    // Las cotizaciones que tuvo.
    if (cotizado) {
      await expect(
        page.getByRole("link", { name: /^cotizacion-cerrada\.pdf/ }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText("Todavía no hay cotizaciones cargadas."),
      ).toBeVisible();
    }
    // La fecha y el motivo del cierre, en el historial (plegado: se abre).
    await page.getByText("Historial de estados").click();
    const cierre = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: motivo, exact: true }) });
    await expect(cierre.getByRole("cell").nth(0)).toHaveText(
      /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/,
    );
    await expect(cierre.getByRole("cell").nth(2)).toHaveText(estado);
    // Sin botones de carga ni de cambio.
    for (const enlace of [
      "Nueva cotización",
      "Anular",
      "Nuevo suceso",
      "Editar",
      "Dar de baja",
    ]) {
      await expect(
        page.getByRole("link", { name: enlace, exact: true }),
      ).toHaveCount(0);
    }
    expect(await transicionesOfrecidas(page)).toEqual([]);
  });
}
