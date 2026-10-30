/**
 * Los sucesos del cliente (F4-05, ADR 0044), en un navegador de verdad contra la
 * imagen que se publica. Una operadora (que el administrador da de alta acá
 * mismo):
 *
 * 1. carga un suceso en un servicio de la semilla;
 * 2. abre la ficha de su cliente desde el listado y ve sus datos, el suceso con
 *    el código del servicio enlazado y el enlace a editar;
 * 3. carga desde ahí un suceso suelto, sin servicio, y lo ve arriba del otro;
 * 4. entra al servicio por el enlace: la columna lateral solo tiene el suyo.
 *
 * Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
const CLIENTE = "Servicios Ejemplo Tres S.A.";
const DEL_SERVICIO = "Se visitó la planta para medir los tanques";
const SUELTO = "El cliente avisó que cambia de contacto";

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

async function cargarSuceso(page: Page, texto: string): Promise<void> {
  await page.getByRole("link", { name: "Nuevo suceso" }).click();
  const nuevo = ventana(page, "Nuevo suceso");
  await nuevo.getByLabel("Qué pasó").fill(texto);
  await nuevo.getByRole("button", { name: "Cargar" }).click();
  await expect(ventana(page, "Nuevo suceso")).toHaveCount(0);
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("una operadora carga un suceso en un servicio y uno suelto, y los ve juntos en la ficha del cliente", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);

  // 1. Un suceso en un servicio de la semilla.
  await page.goto("/servicios");
  await page
    .getByRole("row", { name: /Operación de tanques — ejemplo/ })
    .getByRole("link")
    .click();
  await cargarSuceso(page, DEL_SERVICIO);
  const titulo = await page.getByRole("heading", { level: 1 }).innerText();
  const codigo = titulo.slice(0, titulo.indexOf(" · "));
  expect(codigo).toMatch(/^SRV-\d{4}-\d{3}$/);

  // 2. La ficha del cliente, desde su listado.
  await page.goto("/catalogo/clientes");
  await page.getByRole("link", { name: CLIENTE }).click();
  await expect(page).toHaveURL(/\/catalogo\/clientes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CLIENTE);
  await expect(page.getByText("30-00000003-1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Editar", exact: true }),
  ).toHaveAttribute("href", /\/catalogo\/clientes\?editar=[0-9a-f-]{36}$/);
  const filas = page.getByRole("table").getByRole("row");
  await expect(filas.nth(1)).toContainText(DEL_SERVICIO);
  await expect(filas.nth(1).getByRole("link", { name: codigo })).toBeVisible();

  // 3. Un suceso suelto, desde la ficha: queda arriba, sin servicio.
  await cargarSuceso(page, SUELTO);
  await expect(filas.nth(1)).toContainText(SUELTO);
  await expect(filas.nth(1)).toContainText("Sin servicio");
  await expect(filas.nth(1)).toContainText(OPERADORA);
  await expect(filas.nth(2)).toContainText(DEL_SERVICIO);

  // 4. El servicio sigue como estaba: solo su suceso en la columna lateral.
  await filas.nth(2).getByRole("link", { name: codigo }).click();
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}\/[a-z-]+$/);
  const lateral = page.getByRole("complementary", {
    name: "Observaciones y sucesos",
  });
  await expect(lateral.getByText(DEL_SERVICIO)).toBeVisible();
  await expect(lateral.getByText(SUELTO)).toHaveCount(0);
});

test("una operadora anula una situación suelta desde la ficha: sigue a la vista, tachada y con su motivo; la de un servicio no se ofrece", async ({
  page,
}) => {
  const delServicio = "Se midió otra vez el tanque";
  const suelta = "Se anotó en el cliente equivocado";
  const motivo = "Era de otro cliente";
  await entrarComo(page, OPERADORA);
  await page.goto("/servicios");
  await page
    .getByRole("row", { name: /Operación de tanques — ejemplo/ })
    .getByRole("link")
    .click();
  await cargarSuceso(page, delServicio);
  await page.goto("/catalogo/clientes");
  await page.getByRole("link", { name: CLIENTE }).click();
  await cargarSuceso(page, suelta);
  const filaSuelta = page.getByRole("row").filter({ hasText: suelta });
  const filaDelServicio = page
    .getByRole("row")
    .filter({ hasText: delServicio });
  await expect(filaDelServicio).toBeVisible();
  await expect(
    filaDelServicio.getByRole("link", { name: "Anular" }),
  ).toHaveCount(0);

  await filaSuelta.getByRole("link", { name: "Anular" }).click();
  const anular = ventana(page, "Anular suceso");
  await anular.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(
    anular.getByText("Escribí el motivo de la anulación."),
  ).toBeVisible();
  await anular.getByLabel("Motivo de la anulación").fill(motivo);
  await anular.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(ventana(page, "Anular suceso")).toHaveCount(0);

  await expect(filaSuelta).toContainText(motivo);
  await expect(filaSuelta.locator("del")).toHaveText(suelta);
  await expect(filaSuelta.locator("del")).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  await expect(filaSuelta.getByRole("link", { name: "Anular" })).toHaveCount(0);
  await expect(filaDelServicio.locator("del")).toHaveCount(0);
});
