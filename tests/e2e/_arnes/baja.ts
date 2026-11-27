/**
 * Confirmar una baja desde su ventana: la acción vuelve navegando al listado
 * (`volver-en-el-lugar.ts`), así que la ventana `?baja=<id>` se cierra sola.
 */

import { expect, type Page } from "@playwright/test";

export async function confirmarBaja(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Confirmar baja" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
