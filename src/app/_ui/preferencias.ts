/**
 * Lo que cada navegador recuerda de cómo ve la app (F3-05, ADR 0040): el tema
 * y si el menú lateral está contraído. Viven en dos cookies que escribe el
 * navegador al elegir (`preferencias-en-pantalla.tsx`) y que el layout lee
 * para dibujar la página ya con el tema puesto, sin parpadeo.
 */

import { z } from "zod";

export const TEMAS = ["claro", "oscuro", "sistema"] as const;
export type Tema = (typeof TEMAS)[number];

export type Preferencias = {
  readonly tema: Tema;
  readonly menuContraido: boolean;
};

export const COOKIE_TEMA = "tema";
export const COOKIE_MENU = "menu";

/** Una cookie que falta o que trae otra cosa vale lo de siempre: el tema del sistema y el menú expandido. */
const esquema = z.object({
  tema: z.enum(TEMAS).catch("sistema"),
  menu: z.enum(["contraido", "expandido"]).catch("expandido"),
});

export function preferenciasDe(
  cookie: (nombre: string) => string | undefined,
): Preferencias {
  const { tema, menu } = esquema.parse({
    tema: cookie(COOKIE_TEMA),
    menu: cookie(COOKIE_MENU),
  });
  return { tema, menuContraido: menu === "contraido" };
}
