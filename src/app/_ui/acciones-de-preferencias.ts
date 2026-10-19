"use server";

/**
 * Guardar el tema y el menú contraído (F3-05, ADR 0040). Son formularios: andan
 * sin JavaScript, y con JavaScript Next vuelve a dibujar la página y el layout
 * con la cookie nueva sin recargarla. Una Server Action se puede llamar a mano
 * desde afuera: se exige sesión, aunque no se escriba nada de nadie.
 */

import { cookies } from "next/headers.js";
import { actorDesdeSesion } from "../(auth)/sesion-actual.ts";
import { COOKIE_MENU, COOKIE_TEMA, preferenciasDe } from "./preferencias.ts";

const UN_ANIO_EN_SEGUNDOS = 365 * 24 * 60 * 60;

async function guardar(nombre: string, valor: string): Promise<void> {
  await actorDesdeSesion();
  (await cookies()).set(nombre, valor, {
    path: "/",
    maxAge: UN_ANIO_EN_SEGUNDOS,
    sameSite: "lax",
    httpOnly: true,
  });
}

export async function elegirTema(datos: FormData): Promise<void> {
  const { tema } = preferenciasDe((nombre) =>
    nombre === COOKIE_TEMA ? String(datos.get(nombre)) : undefined,
  );
  await guardar(COOKIE_TEMA, tema);
}

export async function contraerMenu(datos: FormData): Promise<void> {
  const { menuContraido } = preferenciasDe((nombre) =>
    nombre === COOKIE_MENU ? String(datos.get(nombre)) : undefined,
  );
  await guardar(COOKIE_MENU, menuContraido ? "contraido" : "expandido");
}
