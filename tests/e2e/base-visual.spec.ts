/**
 * La base visual (F3-05, ADR 0040) en un navegador de verdad:
 *
 * 1. cada pantalla principal se ve en tema claro y en oscuro, elegidos con el
 *    selector de la cabecera, sin errores en la consola; el tema queda
 *    recordado (la página siguiente llega ya con él) y deja una captura por
 *    pantalla y tema en `test-results/capturas/` para revisar a ojo;
 * 2. «Como el sistema» sigue al del sistema operativo;
 * 3. la barra lateral se contrae a solo íconos y lo recuerda; en el celular es
 *    un menú que se abre con su botón y se cierra con Escape;
 * 4. el listado se ordena tocando el título de la columna, y en Egresos la
 *    fila entera lleva al detalle, también con el teclado.
 *
 * Lo recorre el administrador de la semilla. Todo inventado.
 */

import { expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";

/** Entra con la identidad falsa como `email` y termina en la página de la sesión. */
async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: email }).click();
  await expect(page).toHaveURL(/\/sesion$/);
  await expect(page.locator("[data-email-sesion]")).toHaveText(email);
}

/** La luminancia relativa del fondo de la página: cerca de 1 es claro, cerca de 0, oscuro. */
async function luminanciaDelFondo(page: Page): Promise<number> {
  // Como texto: el repo no carga los tipos del DOM (`lib: ES2023`).
  const color = await page.evaluate<string>(
    "getComputedStyle(document.body).backgroundColor",
  );
  const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? []).map((canal: string) => {
    const valor = Number(canal) / 255;
    return valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

async function elegirTema(
  page: Page,
  nombre: "Claro" | "Oscuro" | "Como el sistema",
  valor: string,
): Promise<void> {
  const tema = page.getByRole("group", { name: "Tema" });
  await tema.getByRole("button", { name: nombre }).click();
  await expect(tema.getByRole("button", { name: nombre })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("data-tema", valor);
}

const PANTALLAS: readonly {
  nombre: string;
  ir: (page: Page) => Promise<void>;
}[] = [
  { nombre: "inicio", ir: (page) => irA(page, "/", "Inicio") },
  { nombre: "servicios", ir: (page) => irA(page, "/servicios", "Servicios") },
  {
    nombre: "servicio",
    ir: async (page) => {
      await irA(page, "/servicios", "Servicios");
      await page.getByRole("link", { name: "Ver" }).first().click();
      await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}$/);
    },
  },
  { nombre: "egresos", ir: (page) => irA(page, "/egresos", "Egresos") },
  {
    nombre: "por-cobrar",
    ir: (page) => irA(page, "/servicios/por-cobrar", "Por cobrar"),
  },
  {
    nombre: "clientes",
    ir: (page) => irA(page, "/catalogo/clientes", "Clientes y proveedores"),
  },
  {
    nombre: "administracion",
    ir: (page) => irA(page, "/administracion/usuarios", "Usuarios"),
  },
];

async function irA(page: Page, ruta: string, titulo: string): Promise<void> {
  await page.goto(ruta);
  await expect(
    page.getByRole("heading", { level: 1, name: titulo }),
  ).toBeVisible();
}

for (const [tema, nombre, oscuro] of [
  ["claro", "Claro", false],
  ["oscuro", "Oscuro", true],
] as const) {
  test(`las pantallas principales en tema ${tema}, elegido en la cabecera y recordado, sin errores en la consola`, async ({
    page,
  }) => {
    const errores: string[] = [];
    page.on("console", (mensaje) => {
      if (mensaje.type() === "error") {
        errores.push(mensaje.text());
      }
    });
    page.on("pageerror", (error) => errores.push(error.message));

    await entrarComo(page, ADMIN);
    await irA(page, "/", "Inicio");
    // Primero el otro, para que elegir este sea un cambio de verdad.
    await elegirTema(
      page,
      oscuro ? "Claro" : "Oscuro",
      oscuro ? "claro" : "oscuro",
    );
    await elegirTema(page, nombre, tema);
    expect((await luminanciaDelFondo(page)) < 0.1).toBe(oscuro);

    for (const pantalla of PANTALLAS) {
      await pantalla.ir(page);
      await expect(page.locator("html")).toHaveAttribute("data-tema", tema);
      expect((await luminanciaDelFondo(page)) < 0.1).toBe(oscuro);
      await page.screenshot({
        path: `test-results/capturas/${pantalla.nombre}-${tema}.png`,
        fullPage: true,
      });
    }

    expect(errores).toEqual([]);
  });
}

test("«Como el sistema» sigue al tema del sistema operativo", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  await irA(page, "/", "Inicio");
  await elegirTema(page, "Oscuro", "oscuro");
  await elegirTema(page, "Como el sistema", "sistema");

  await page.emulateMedia({ colorScheme: "dark" });
  expect(await luminanciaDelFondo(page)).toBeLessThan(0.1);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await luminanciaDelFondo(page)).toBeGreaterThan(0.8);
});

test("la barra lateral se contrae a solo íconos y lo recuerda al volver a entrar", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  await irA(page, "/egresos", "Egresos");
  const menu = page.getByRole("navigation", { name: "Secciones" });
  const boton = menu.getByRole("button", { name: "Menú lateral" });
  const ancho = async () => (await menu.boundingBox())?.width ?? 0;

  await expect(boton).toHaveAttribute("aria-expanded", "true");
  expect(await ancho()).toBeGreaterThan(200);

  await boton.click();
  await expect(boton).toHaveAttribute("aria-expanded", "false");
  expect(await ancho()).toBeLessThan(80);
  // Contraída, cada entrada sigue teniendo su nombre para el lector de pantalla.
  await expect(menu.getByRole("link", { name: "Egresos" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.reload();
  await expect(boton).toHaveAttribute("aria-expanded", "false");
  expect(await ancho()).toBeLessThan(80);

  await boton.click();
  await expect(boton).toHaveAttribute("aria-expanded", "true");
});

test("en el celular el menú se abre con su botón y se cierra con Escape o al navegar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await entrarComo(page, ADMIN);
  await irA(page, "/", "Inicio");
  const menu = page.getByRole("navigation", { name: "Secciones" });
  const abrir = menu.getByRole("button", { name: "Menú", exact: true });
  const egresos = menu.getByRole("link", { name: "Egresos" });

  await expect(egresos).toBeHidden();
  await abrir.click();
  await expect(abrir).toHaveAttribute("aria-expanded", "true");
  await expect(egresos).toBeVisible();

  await egresos.focus();
  await page.keyboard.press("Escape");
  await expect(egresos).toBeHidden();
  await expect(abrir).toBeFocused();

  await abrir.click();
  await egresos.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Egresos" }),
  ).toBeVisible();
  await expect(egresos).toBeHidden();
});

test("el listado se ordena tocando el título de la columna, sin un control aparte", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  await irA(page, "/catalogo/grupos", "Grupos");
  const nombre = page.getByRole("columnheader", { name: "Nombre" });

  await expect(page.getByText("Ordenar por:")).toHaveCount(0);
  await expect(nombre).toHaveAttribute("aria-sort", "ascending");

  await nombre.getByRole("link").click();
  await expect(page).toHaveURL(/[?&]orden=nombre&direccion=desc/);
  await expect(nombre).toHaveAttribute("aria-sort", "descending");
});

test("en Egresos la fila entera lleva al detalle, con el mouse y con el teclado", async ({
  page,
}) => {
  await entrarComo(page, ADMIN);
  await irA(page, "/egresos", "Egresos");

  // Con el mouse, en una celda que no es la del enlace (el importe).
  const importe = page.getByRole("row").nth(1).getByRole("cell").nth(4);
  const caja = await importe.boundingBox();
  if (caja === null) {
    throw new Error("la celda del importe no se ve");
  }
  await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await expect(page).toHaveURL(/\/egresos\/[0-9a-f-]{36}$/);

  // Con el teclado: Tab desde el buscador hasta la primera fila, y Enter.
  await irA(page, "/egresos", "Egresos");
  await page.getByRole("button", { name: "Buscar" }).focus();
  let destino = "";
  for (
    let tabs = 0;
    tabs < 20 && !/\/egresos\/[0-9a-f-]{36}$/.test(destino);
    tabs++
  ) {
    await page.keyboard.press("Tab");
    destino = await page.evaluate<string>(
      'document.activeElement?.getAttribute("href") ?? ""',
    );
  }
  expect(destino).toMatch(/\/egresos\/[0-9a-f-]{36}$/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${destino}$`));
});
