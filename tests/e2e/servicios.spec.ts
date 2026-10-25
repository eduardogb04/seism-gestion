/**
 * Servicios (F2-04, ADR 0033), en un navegador de verdad contra la imagen que
 * se publica. Lo recorre una operadora, que el administrador da de alta acá
 * mismo:
 *
 * 1. ve los servicios de la semilla, lo más nuevo primero, cada uno con su
 *    estado, y filtra por estado;
 * 2. da de alta uno recurrente sin vigencia: el mensaje aparece al lado del
 *    campo; lo corrige y queda en la pantalla del servicio, con su código y
 *    «Creado»;
 * 3. marca un sitio de su cliente;
 * 4. carga un suceso y lo ve en *Sucesos*, con quién (F3-01);
 * 5. lo cancela: sin motivo dice que lo pide (DOM-0017); con motivo cambia el
 *    estado y lo ve en el historial, con los días y quién;
 * 6. ya cancelado, no se le ofrece la baja ni la edición.
 *
 * Usa `operador.catalogos@ejemplo.test`, como los otros catálogos (la identidad falsa no ofrece más). Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const TITULO = "Traslado de prueba — ejemplo";

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

test("una operadora da de alta un servicio, le marca un sitio, carga un suceso, lo cancela con motivo, ve el historial y no puede darlo de baja", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);
  await page.goto("/servicios");

  // 1. El listado de la semilla: Servicios es lo primero del menú, lo más nuevo primero.
  await expect(page.getByRole("heading", { name: "Servicios" })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(menu.getByRole("link").first()).toHaveText("Inicio");
  await expect(menu.getByRole("link").nth(1)).toHaveText("Servicios");
  await expect(menu.getByRole("link", { name: "Servicios" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(fila(page, /Auditoría de tanques — ejemplo/)).toContainText(
    "Creado",
  );
  await expect(fila(page, /Auditoría de tanques — ejemplo/)).toContainText(
    "Empresa Ejemplo Uno S.A.",
  );
  await expect(fila(page, /Informe técnico — ejemplo/)).toContainText(
    "Cerrado",
  );

  // El código no se parte en dos renglones a 1366 px.
  await page.setViewportSize({ width: 1366, height: 768 });
  const codigo = fila(page, /Informe técnico — ejemplo/).getByRole("cell", {
    name: /^SRV-\d{4}-\d{3}$/,
  });
  await expect(codigo).toHaveCSS("white-space", "nowrap");

  await page.getByLabel("Estado").selectOption({ label: "En ejecución" });
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/[?&]estado=en_ejecucion(&|$)/);
  await expect(fila(page, /Operación de tanques — ejemplo/)).toContainText(
    /SRV-\d{4}-\d{3}/,
  );
  await expect(fila(page, /Auditoría de tanques — ejemplo/)).toHaveCount(0);
  await page.goto("/servicios");

  // 2. Alta: recurrente sin vigencia vuelve con el mensaje al lado del campo.
  await page.getByRole("link", { name: "Alta de servicio" }).click();
  const alta = ventana(page, "Alta de servicio");
  await expect(alta).toBeVisible();
  await expect(alta.getByLabel("Modalidad")).toHaveValue("puntual");
  await alta
    .getByLabel("Cliente")
    .selectOption({ label: "Empresa Ejemplo Uno S.A." });
  await alta
    .getByLabel("Tipo de servicio")
    .selectOption({ label: "Logística" });
  await alta.getByLabel("Título").fill(TITULO);
  await alta.getByLabel("Modalidad").selectOption("recurrente");
  await alta.getByLabel("Responsable").selectOption({ label: ADMIN });
  await alta.getByLabel("Fecha de pedido").fill("2026-11-05");
  await alta.getByRole("button", { name: "Guardar" }).click();

  await expect(alta.getByLabel("Vigencia desde")).toHaveAccessibleDescription(
    /Un servicio recurrente lleva vigencia/,
  );
  await expect(alta.getByLabel("Título")).toHaveValue(TITULO);

  await alta.getByLabel("Modalidad").selectOption("puntual");
  await alta.getByRole("button", { name: "Guardar" }).click();

  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^SRV-\d{4}-\d{3} · Traslado de prueba — ejemplo$/,
  );
  const estado = page.locator("[data-estado-del-servicio]");
  await expect(estado).toHaveText("Creado");
  await expect(page.getByText("Empresa Ejemplo Uno S.A.")).toBeVisible();

  // 3. Los sitios de su cliente, y solo esos: se marca uno.
  await expect(page.getByLabel("Planta Ejemplo Sur")).not.toBeChecked();
  await expect(page.getByLabel("Estación Ejemplo Este")).toHaveCount(0);
  await page.getByLabel("Planta Ejemplo Norte").check();
  // Recargar antes de que termine el POST lo cancela: se espera su respuesta.
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByRole("button", { name: "Guardar sitios" }).click(),
  ]);
  await page.reload();
  await expect(page.getByLabel("Planta Ejemplo Norte")).toBeChecked();
  await expect(page.getByLabel("Planta Ejemplo Sur")).not.toBeChecked();

  // 4. Un suceso: queda en la tabla, con quién lo cargó.
  await page.getByRole("link", { name: "Nuevo suceso" }).click();
  const suceso = ventana(page, "Nuevo suceso");
  await expect(suceso.getByLabel("Fecha")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await suceso.getByLabel("Qué pasó").fill("Llamó el cliente para posponer");
  await suceso.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nuevo suceso")).toHaveCount(0);
  const tablaDeSucesos = page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: "Qué pasó" }) });
  const elSuceso = tablaDeSucesos.getByRole("row").nth(1);
  await expect(elSuceso).toContainText("Llamó el cliente para posponer");
  await expect(elSuceso).toContainText(OPERADORA);

  // 5. Cancelar pide confirmación y motivo: sin él, el código en pantalla y el estado igual.
  await expect(
    page.getByRole("link", { name: "Pasar a «Cotizado»" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Pasar a «Cancelado»" }).click();
  await ventana(page, "Pasar a «Cancelado»")
    .getByRole("button", { name: "Confirmar" })
    .click();
  await expect(page.locator("[data-codigo-error]")).toHaveText("DOM-0017");
  await expect(
    page.getByText("Ese cambio de estado pide un motivo"),
  ).toBeVisible();
  await expect(estado).toHaveText("Creado");

  await page.getByRole("link", { name: "Pasar a «Cancelado»" }).click();
  await ventana(page, "Pasar a «Cancelado»")
    .getByLabel("Nota o motivo")
    .fill("Ya no lo necesita");
  await ventana(page, "Pasar a «Cancelado»")
    .getByRole("button", { name: "Confirmar" })
    .click();
  await expect(estado).toHaveText("Cancelado");
  await expect(
    page.getByRole("link", { name: "Pasar a «Cancelado»" }),
  ).toHaveCount(0);

  const historial = page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: "Quién" }) });
  const cambio = historial.getByRole("row").nth(1);
  await expect(cambio).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  await expect(cambio.getByRole("cell").nth(1)).toHaveText("Creado");
  await expect(cambio.getByRole("cell").nth(2)).toHaveText("Cancelado");
  await expect(cambio.getByRole("cell").nth(3)).toHaveText("0");
  await expect(cambio.getByRole("cell").nth(4)).toHaveText(OPERADORA);
  await expect(cambio.getByRole("cell").nth(5)).toHaveText("Ya no lo necesita");
  const elAlta = historial.getByRole("row").nth(2);
  await expect(elAlta.getByRole("cell").nth(2)).toHaveText("Creado");
  await expect(historial.getByRole("row")).toHaveCount(3);

  // 6. Cancelado se mira (F5-01): ni la baja ni la edición se ofrecen.
  for (const enlace of ["Dar de baja", "Editar"]) {
    await expect(page.getByRole("link", { name: enlace })).toHaveCount(0);
  }

  await page.getByRole("link", { name: "Volver a Servicios" }).click();
  await expect(fila(page, new RegExp(TITULO)).first()).toContainText(
    "Cancelado",
  );
  // El más nuevo por fecha de pedido queda primero.
  await expect(page.getByRole("row").nth(1)).toContainText(TITULO);
});
