/**
 * El login con la identidad falsa (F0-31, R9), en un navegador de verdad
 * contra la imagen que se publica y una base real (la `postgres-e2e` que
 * `scripts/e2e-app.ts` migra y siembra con `admin@ejemplo.test`).
 *
 * - Un usuario activo sembrado entra: queda la cookie de sesión (`httpOnly`,
 *   `SameSite=Lax`, `Path=/`; sin `Secure` porque es `APP_ENTORNO=local`
 *   sobre http) y la página de la sesión muestra su email —la valida el helper
 *   del servidor contra la base—. Al cerrar sesión, deja de haberla.
 * - Un email sin usuario ve `AUT-0001` en pantalla y no le queda sesión.
 * - Un `state` que no es el del login ve `AUT-0002`.
 *
 * Todo inventado (`@ejemplo.test`).
 */

import { type BrowserContext, expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const SIN_USUARIO = "sin-acceso@ejemplo.test";

async function cookieDeSesion(contexto: BrowserContext) {
  const cookies = await contexto.cookies();
  return cookies.find((cookie) => cookie.name === "seism_sesion");
}

/** Entra a `/ingresar` y termina en la pantalla de la identidad falsa. */
async function pantallaDePrueba(page: Page): Promise<void> {
  await page.goto("/ingresar");
  await expect(page).toHaveURL(/\/ingresar\/prueba\?state=/);
  await expect(
    page.getByRole("heading", { name: "Identidad de prueba" }),
  ).toBeVisible();
}

test("un usuario activo sembrado entra con la identidad falsa y queda con sesión", async ({
  page,
  context,
}) => {
  await pantallaDePrueba(page);
  await expect(page.getByRole("link", { name: SIN_USUARIO })).toBeVisible();

  await page.getByRole("link", { name: ADMIN }).click();

  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(ADMIN);
  const sesion = await cookieDeSesion(context);
  expect(sesion).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: false,
  });
  expect(sesion?.value).toMatch(/^[\w-]{43}$/);
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === "seism_login")).toBe(false);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();

  await expect(page).toHaveURL(/\/ingresar/);
  expect(await cookieDeSesion(context)).toBeUndefined();
  await page.goto("/sesion");
  await expect(page.getByRole("heading", { name: "Sin sesión" })).toBeVisible();
});

test("un email sin usuario ve AUT-0001 en pantalla y no le queda sesión", async ({
  page,
  context,
}) => {
  await pantallaDePrueba(page);

  await page.getByRole("link", { name: SIN_USUARIO }).click();

  await expect(page).toHaveURL(/\/ingresar\/error\?codigo=AUT-0001$/);
  await expect(page.locator("[data-codigo-error]")).toHaveText("AUT-0001");
  await expect(page.getByText("No tenés acceso al sistema")).toBeVisible();
  expect(await cookieDeSesion(context)).toBeUndefined();
});

test("un state que no es el del login ve AUT-0002 y no le queda sesión", async ({
  page,
  context,
}) => {
  await pantallaDePrueba(page);
  const enlace = await page
    .getByRole("link", { name: ADMIN })
    .getAttribute("href");
  expect(enlace).not.toBeNull();
  const alterado = new URL(enlace ?? "", "http://base.ejemplo.test");
  alterado.searchParams.set("state", "otro-state");

  await page.goto(`${alterado.pathname}${alterado.search}`);

  await expect(page.locator("[data-codigo-error]")).toHaveText("AUT-0002");
  expect(await cookieDeSesion(context)).toBeUndefined();
});
