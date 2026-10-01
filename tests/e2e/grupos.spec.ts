/**
 * Grupos, el primer ABM del molde (F1-03, ADR 0031), en un navegador de verdad
 * contra la imagen que se publica. Lo recorre una **operadora** (los catálogos
 * los edita cualquier usuario activo), que el administrador da de alta acá
 * mismo:
 *
 * 1. ve los grupos de la semilla y da de alta uno;
 * 2. intenta otra alta con el mismo nombre: el mensaje aparece al lado del
 *    campo y lo que escribió sigue en el formulario;
 * 3. lo edita, con una búsqueda puesta: cancelar o Escape vuelven al listado
 *    con esa búsqueda;
 * 4. lo da de baja, con su confirmación, y deja de aparecer.
 *
 * Alta, edición y baja son una ventana sobre el listado (F1-09): en cada paso
 * la ruta sigue siendo `/catalogo/grupos` y la tabla sigue en la página detrás.
 *
 * Y con **JavaScript apagado** el formulario se comporta igual: vuelve con lo
 * escrito y el mensaje, da de alta y da de baja.
 *
 * Usa `operador.catalogos@ejemplo.test` y no `operador@ejemplo.test`: a ese lo
 * da de alta y lo revoca `usuarios.spec.ts`. Todo inventado.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador.catalogos@ejemplo.test";
/** El listado, con o sin parámetros: nunca otra ruta. */
const LISTADO = /\/catalogo\/grupos(\?.*)?$/;
const CON_BUSQUEDA = /[?&]buscar=Grupo(&|$)/;

/** Entra con la identidad falsa como `email` y termina en la página de la sesión. */
async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: email }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(email);
}

/** El administrador da de alta a la operadora, si todavía no existe. */
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

function fila(page: Page, nombre: string) {
  return page.getByRole("row", { name: new RegExp(nombre) });
}

function ventana(page: Page, titulo: string) {
  return page.getByRole("dialog", { name: titulo });
}

/** Sigue en el listado y su tabla sigue en la página, detrás de la ventana. */
async function listadoDetras(page: Page): Promise<void> {
  await expect(page).toHaveURL(LISTADO);
  await expect(page.getByRole("table")).toBeVisible();
}

/** La ventana se cerró y se volvió al listado, sin parámetro de ventana. */
async function ventanaCerrada(page: Page): Promise<void> {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(LISTADO);
  await expect(page).not.toHaveURL(/[?&](nuevo|editar|baja)=/);
}

test.beforeEach(async ({ browser, baseURL }) => {
  await asegurarOperadora(browser, baseURL);
});

test("una operadora da de alta, edita y da de baja un grupo en ventanas sobre el listado; un nombre repetido vuelve a la ventana con lo escrito", async ({
  page,
}) => {
  await entrarComo(page, OPERADORA);
  await page.goto("/catalogo/grupos");

  // El menú: los catálogos sí, lo del administrador no.
  await expect(page.getByRole("heading", { name: "Grupos" })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Secciones" });
  await expect(menu.getByRole("link", { name: "Grupos" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(menu.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
  // La semilla ficticia.
  await expect(fila(page, "Grupo Centro")).toBeVisible();

  // 1. Alta: la ventana abre con el foco en el primer campo.
  await page.getByRole("link", { name: "Alta de grupo" }).click();
  await expect(ventana(page, "Alta de grupo")).toHaveAttribute(
    "aria-modal",
    "true",
  );
  await listadoDetras(page);
  await expect(page.getByLabel("Nombre")).toBeFocused();
  await page.getByLabel("Nombre").fill("Grupo Este");
  await page.getByLabel("Observaciones").fill("Creado en el e2e");
  await page.getByRole("button", { name: "Guardar" }).click();
  await ventanaCerrada(page);
  await expect(fila(page, "Grupo Este")).toContainText("Creado en el e2e");

  // 2. El mismo nombre, con otras mayúsculas: la ventana sigue abierta con el
  // mensaje al lado del campo y lo escrito.
  await page.getByRole("link", { name: "Alta de grupo" }).click();
  await page.getByLabel("Nombre").fill("grupo ESTE");
  await page.getByLabel("Observaciones").fill("Otra nota");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(
    ventana(page, "Alta de grupo").locator("[data-error-de-campo]"),
  ).toHaveText(/DOM-0008/);
  await expect(page.getByLabel("Nombre")).toHaveAccessibleDescription(
    /DOM-0008/,
  );
  await listadoDetras(page);
  await expect(page).toHaveURL(/[?&]nuevo=1/);
  await expect(page.getByLabel("Nombre")).toHaveValue("grupo ESTE");
  await expect(page.getByLabel("Observaciones")).toHaveValue("Otra nota");
  await page.getByRole("link", { name: "Cancelar" }).click();
  await ventanaCerrada(page);
  await expect(page.getByRole("row", { name: /grupo este/i })).toHaveCount(1);

  // 3. Edición, con una búsqueda puesta: cancelar, Escape y guardar la conservan.
  await page.getByRole("searchbox", { name: "Buscar" }).fill("Grupo");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(CON_BUSQUEDA);
  await fila(page, "Grupo Este").getByRole("link", { name: "Editar" }).click();
  await expect(ventana(page, "Edición de grupo")).toBeVisible();
  await listadoDetras(page);
  await expect(page).toHaveURL(CON_BUSQUEDA);
  await expect(page.getByLabel("Nombre")).toBeFocused();
  await expect(page.getByLabel("Nombre")).toHaveValue("Grupo Este");
  await expect(page.getByLabel("Observaciones")).toHaveValue(
    "Creado en el e2e",
  );
  await page.getByRole("link", { name: "Cancelar" }).click();
  await ventanaCerrada(page);
  await expect(page).toHaveURL(CON_BUSQUEDA);
  await fila(page, "Grupo Este").getByRole("link", { name: "Editar" }).click();
  await expect(ventana(page, "Edición de grupo")).toBeVisible();
  await page.keyboard.press("Escape");
  await ventanaCerrada(page);
  await expect(page).toHaveURL(CON_BUSQUEDA);
  await expect(fila(page, "Grupo Este")).toBeVisible();

  await fila(page, "Grupo Este").getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Nombre").fill("Grupo Oeste");
  await page.getByRole("button", { name: "Guardar" }).click();
  await ventanaCerrada(page);
  await expect(page).toHaveURL(CON_BUSQUEDA);
  await expect(fila(page, "Grupo Oeste")).toBeVisible();
  await expect(fila(page, "Grupo Este")).toHaveCount(0);

  // 4. Baja: primero la confirmación, con el foco en Cancelar; cancelar no da
  // de baja nada.
  await fila(page, "Grupo Oeste")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  await expect(ventana(page, "Baja de grupo")).toContainText("Grupo Oeste");
  await listadoDetras(page);
  await expect(page.getByRole("link", { name: "Cancelar" })).toBeFocused();
  await page.getByRole("link", { name: "Cancelar" }).click();
  await ventanaCerrada(page);
  await expect(fila(page, "Grupo Oeste")).toBeVisible();
  await fila(page, "Grupo Oeste")
    .getByRole("link", { name: "Dar de baja" })
    .click();
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await ventanaCerrada(page);
  await expect(fila(page, "Grupo Centro")).toBeVisible();
  await expect(fila(page, "Grupo Oeste")).toHaveCount(0);
  await expect(page.locator("[data-codigo-error]")).toHaveCount(0);
});

test.describe("con JavaScript apagado", () => {
  test.use({ javaScriptEnabled: false });

  test("la ventana vuelve con lo escrito y el mensaje al lado del campo, da de alta y da de baja", async ({
    page,
  }) => {
    await entrarComo(page, OPERADORA);
    await page.goto("/catalogo/grupos");
    await page.getByRole("link", { name: "Alta de grupo" }).click();
    await expect(ventana(page, "Alta de grupo")).toBeVisible();

    // Un nombre que ya existe (el de la semilla).
    await page.getByLabel("Nombre").fill("grupo centro");
    await page.getByLabel("Observaciones").fill("Escrito sin JavaScript");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(
      ventana(page, "Alta de grupo").locator("[data-error-de-campo]"),
    ).toHaveText(/DOM-0008/);
    await listadoDetras(page);
    await expect(page.getByLabel("Nombre")).toHaveValue("grupo centro");
    await expect(page.getByLabel("Observaciones")).toHaveValue(
      "Escrito sin JavaScript",
    );

    // Una validación: sin nombre.
    await page.getByLabel("Nombre").fill("");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator("[data-error-de-campo]")).toHaveText(
      "Escribí el nombre.",
    );
    await expect(page.getByLabel("Observaciones")).toHaveValue(
      "Escrito sin JavaScript",
    );

    // Corregido, da de alta y vuelve al listado.
    await page.getByLabel("Nombre").fill("Grupo Sin Script");
    await page.getByRole("button", { name: "Guardar" }).click();
    await ventanaCerrada(page);
    await expect(fila(page, "Grupo Sin Script")).toContainText(
      "Escrito sin JavaScript",
    );

    // La baja, con su confirmación: Cancelar vuelve sin dar de baja nada.
    await fila(page, "Grupo Sin Script")
      .getByRole("link", { name: "Dar de baja" })
      .click();
    await expect(ventana(page, "Baja de grupo")).toContainText(
      "Grupo Sin Script",
    );
    await listadoDetras(page);
    await page.getByRole("link", { name: "Cancelar" }).click();
    await ventanaCerrada(page);
    await expect(fila(page, "Grupo Sin Script")).toBeVisible();
    await fila(page, "Grupo Sin Script")
      .getByRole("link", { name: "Dar de baja" })
      .click();
    await page.getByRole("button", { name: "Confirmar baja" }).click();
    await ventanaCerrada(page);
    await expect(fila(page, "Grupo Sin Script")).toHaveCount(0);
    await expect(fila(page, "Grupo Centro")).toBeVisible();
  });
});
