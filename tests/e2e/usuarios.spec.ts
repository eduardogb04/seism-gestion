/**
 * La lista blanca desde la pantalla y la protección del panel (F0-32), en un
 * navegador de verdad contra la imagen que se publica, con la identidad falsa
 * y la base `postgres-e2e` (sembrada con `admin@ejemplo.test`). Un solo
 * recorrido, con **dos contextos de navegador** para tener las dos sesiones a
 * la vez:
 *
 * 1. la administradora da de alta a `operador@ejemplo.test` (escrito con
 *    mayúsculas: queda en minúsculas) y sale;
 * 2. la operadora entra y `/administracion` rebota con `AUT-0003` (el código
 *    a la vista, sin ningún dato);
 * 3. la administradora la revoca;
 * 4. la **misma** página de la operadora, con su cookie todavía puesta, se
 *    recarga y es rechazada (`AUT-0002`): la siguiente request no espera a
 *    que venza la caché de 30 s.
 *
 * `/api/salud` sigue abierta: un contexto sin sesión la lee. Todo inventado
 * (`@ejemplo.test`).
 */

import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const OPERADORA = "operador@ejemplo.test";

async function cookieDeSesion(contexto: BrowserContext) {
  const cookies = await contexto.cookies();
  return cookies.find((cookie) => cookie.name === "seism_sesion");
}

/** Entra con la identidad falsa como `email` y termina en la página de la sesión. */
async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: email }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(email);
}

/** Un contexto aparte (otro navegador, otras cookies) contra la misma app. */
function contextoNuevo(
  browser: Browser,
  baseURL: string | undefined,
): Promise<BrowserContext> {
  return browser.newContext(baseURL === undefined ? {} : { baseURL });
}

async function salir(page: Page): Promise<void> {
  await page.goto("/sesion");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/ingresar/);
}

test("el administrador da de alta y revoca; la operadora rebota con AUT-0003 y, revocada, su cookie ya no sirve", async ({
  browser,
  baseURL,
}) => {
  const contextoAdmin = await contextoNuevo(browser, baseURL);
  const contextoOperadora = await contextoNuevo(browser, baseURL);
  const admin = await contextoAdmin.newPage();
  const operadora = await contextoOperadora.newPage();

  // 1. La administradora da de alta con el selector y el email en mayúsculas.
  await entrarComo(admin, ADMIN);
  await admin.goto("/administracion/usuarios");
  await expect(admin.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  const selectorDeRol = admin.getByLabel("Rol", { exact: true });
  await expect(selectorDeRol).toHaveJSProperty("tagName", "SELECT");
  await expect(selectorDeRol.locator("option")).toHaveText([
    "Administrador",
    "Operador",
  ]);
  await admin.getByLabel("Email").fill("Operador@Ejemplo.TEST");
  await selectorDeRol.selectOption("operador");
  await admin.getByRole("button", { name: "Dar de alta" }).click();

  await expect(admin).toHaveURL(/\/administracion\/usuarios$/);
  const fila = admin.locator(`[data-usuario="${OPERADORA}"]`);
  await expect(fila).toBeVisible();
  await expect(admin.locator("[data-codigo-error]")).toHaveCount(0);
  await salir(admin);

  // 2. La operadora entra y no pasa de la puerta.
  await entrarComo(operadora, OPERADORA);
  await operadora.goto("/administracion");
  await expect(operadora.locator("[data-codigo-error]")).toHaveText("AUT-0003");
  await operadora.goto("/administracion/usuarios");
  await expect(operadora.locator("[data-codigo-error]")).toHaveText("AUT-0003");
  await expect(
    operadora.getByRole("button", { name: "Dar de alta" }),
  ).toHaveCount(0);
  await expect(operadora.locator("[data-usuario]")).toHaveCount(0);
  const cookieAntes = await cookieDeSesion(contextoOperadora);
  expect(cookieAntes).toBeDefined();

  // 3. La administradora la revoca.
  await entrarComo(admin, ADMIN);
  await admin.goto("/administracion/usuarios");
  await admin
    .locator(`[data-usuario="${OPERADORA}"]`)
    .getByRole("button", { name: "Revocar" })
    .click();
  await expect(admin.locator(`[data-usuario="${OPERADORA}"]`)).toContainText(
    "revocado",
  );

  // 4. La misma página de la operadora, con la misma cookie, es rechazada.
  expect(await cookieDeSesion(contextoOperadora)).toEqual(cookieAntes);
  await operadora.reload();
  await expect(operadora).toHaveURL(/\/ingresar\/error\?codigo=AUT-0002$/);
  await expect(operadora.locator("[data-codigo-error]")).toHaveText("AUT-0002");
  expect(await cookieDeSesion(contextoOperadora)).toEqual(cookieAntes);

  // El latido del deploy sigue abierto, sin sesión.
  const sinSesion = await contextoNuevo(browser, baseURL);
  const latido = await sinSesion.request.get("/api/salud");
  expect(latido.status()).toBe(200);
  expect(await latido.json()).toMatchObject({ ok: true });

  await Promise.all([
    contextoAdmin.close(),
    contextoOperadora.close(),
    sinSesion.close(),
  ]);
});
