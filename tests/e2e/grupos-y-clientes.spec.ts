/**
 * Grupos y clientes desde los dos lados (F3-09), en un navegador de verdad
 * contra la imagen que se publica. Un administrador, con dos grupos que da de
 * alta acá y un cliente de la semilla que no tiene grupo:
 *
 * 1. desde la pantalla de un grupo agrega ese cliente y lo ve en el formulario
 *    del cliente;
 * 2. desde el formulario del cliente le elige el otro grupo y lo ve en la
 *    pantalla de ese grupo, y no en la del primero;
 * 3. desde el primer grupo lo agrega de nuevo: como ya tenía otro, pide
 *    confirmación; cancelar no lo mueve y confirmar sí;
 * 4. lo saca del grupo, y el formulario del cliente queda sin grupo;
 * 5. lo asigna y lo deja sin grupo desde el formulario del cliente.
 *
 * Al final da de baja los dos grupos, que quedan vacíos. Todo inventado.
 */

import { expect, type Page, test } from "@playwright/test";

const ADMIN = "admin@ejemplo.test";
const CLIENTE = "Empresa Ejemplo Dos S.R.L.";

async function entrarComoAdmin(page: Page): Promise<void> {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: ADMIN }).click();
  await expect(page).toHaveURL(/\/sesion$/);
}

async function altaDeGrupo(page: Page, nombre: string): Promise<void> {
  await page.goto("/catalogo/grupos");
  await page.getByRole("link", { name: "Alta de grupo" }).click();
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function pantallaDelGrupo(page: Page, nombre: string): Promise<void> {
  await page.goto("/catalogo/grupos");
  await page.getByRole("link", { name: nombre, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: nombre, level: 1 }),
  ).toBeVisible();
}

function filaDelCliente(page: Page) {
  return page.getByRole("row", { name: new RegExp(CLIENTE) });
}

/** Abre el formulario de edición del cliente y devuelve su selector de grupo. */
async function grupoEnElFormulario(page: Page) {
  await page.goto("/catalogo/clientes");
  await filaDelCliente(page).getByRole("link", { name: "Editar" }).click();
  return page.getByLabel("Grupo", { exact: true });
}

async function elegirGrupoDelCliente(page: Page, etiqueta: string) {
  const grupo = await grupoEnElFormulario(page);
  await grupo.selectOption({ label: etiqueta });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function agregarDesdeElGrupo(page: Page, opcion: string): Promise<void> {
  await page
    .getByLabel("Cliente o proveedor", { exact: true })
    .selectOption({ label: opcion });
  await page.getByRole("button", { name: "Agregar" }).click();
}

test("agregar, mover (con confirmación) y sacar clientes desde el grupo se ve en el cliente, y asignar desde el cliente se ve en el grupo", async ({
  page,
}) => {
  await entrarComoAdmin(page);
  await altaDeGrupo(page, "Grupo Alfa");
  await altaDeGrupo(page, "Grupo Beta");

  // 1. Desde el grupo: agrega al cliente sin grupo y lo ve en su formulario.
  await pantallaDelGrupo(page, "Grupo Alfa");
  await expect(page.getByText("Todavía no tiene clientes.")).toBeVisible();
  await agregarDesdeElGrupo(page, CLIENTE);
  await expect(filaDelCliente(page)).toContainText("30-00000002-3");
  await expect(
    (await grupoEnElFormulario(page)).locator("option:checked"),
  ).toHaveText("Grupo Alfa");

  // 2. Desde el cliente: le elige el otro grupo y lo ve en esa pantalla, no en la otra.
  await elegirGrupoDelCliente(page, "Grupo Beta");
  await pantallaDelGrupo(page, "Grupo Beta");
  await expect(filaDelCliente(page)).toBeVisible();
  await pantallaDelGrupo(page, "Grupo Alfa");
  await expect(filaDelCliente(page)).toHaveCount(0);

  // 3. Lo agrega desde el primer grupo: tenía otro, pide confirmar; cancelar no lo mueve.
  await agregarDesdeElGrupo(page, `${CLIENTE} (en Grupo Beta)`);
  const ventana = page.getByRole("dialog", { name: "Mover un cliente" });
  await expect(ventana).toContainText(
    `${CLIENTE} está en Grupo Beta. ¿Moverlo a Grupo Alfa?`,
  );
  await ventana.getByRole("link", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(filaDelCliente(page)).toHaveCount(0);
  await pantallaDelGrupo(page, "Grupo Beta");
  await expect(filaDelCliente(page)).toBeVisible();

  // Confirmar sí lo mueve.
  await pantallaDelGrupo(page, "Grupo Alfa");
  await agregarDesdeElGrupo(page, `${CLIENTE} (en Grupo Beta)`);
  await page.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(filaDelCliente(page)).toBeVisible();
  await pantallaDelGrupo(page, "Grupo Beta");
  await expect(filaDelCliente(page)).toHaveCount(0);

  // 4. Lo saca desde el grupo: pide confirmación y el cliente queda sin grupo.
  await pantallaDelGrupo(page, "Grupo Alfa");
  await filaDelCliente(page)
    .getByRole("link", { name: "Sacar del grupo" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Sacar un cliente" }),
  ).toContainText(`¿Sacar a ${CLIENTE} de Grupo Alfa?`);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Todavía no tiene clientes.")).toBeVisible();
  await expect(await grupoEnElFormulario(page)).toHaveValue("");

  // 5. Desde el formulario del cliente también se puede dejar sin grupo.
  await elegirGrupoDelCliente(page, "Grupo Alfa");
  await pantallaDelGrupo(page, "Grupo Alfa");
  await expect(filaDelCliente(page)).toBeVisible();
  await elegirGrupoDelCliente(page, "Ninguno");
  await pantallaDelGrupo(page, "Grupo Alfa");
  await expect(page.getByText("Todavía no tiene clientes.")).toBeVisible();

  // Los dos grupos quedan vacíos: se dan de baja.
  for (const nombre of ["Grupo Alfa", "Grupo Beta"]) {
    await page.goto("/catalogo/grupos");
    await page
      .getByRole("row", { name: new RegExp(nombre) })
      .getByRole("link", { name: "Dar de baja" })
      .click();
    await page.getByRole("button", { name: "Confirmar baja" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("row", { name: new RegExp(nombre) }),
    ).toHaveCount(0);
  }
});
