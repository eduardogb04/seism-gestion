/**
 * `/servicios/<id>` lleva al panel de la etapa actual (F6-01, ADR 0048), con
 * los mismos parámetros: los enlaces de siempre (calendario, inicio,
 * vencimientos, renovación) y las acciones que vuelven con `?error=` siguen
 * sirviendo. Si el servicio no existe, el layout muestra el error.
 */

import { redirect } from "next/navigation.js";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import type { PropsDeEtapa } from "./panel.tsx";
import { rutaDeEtapa, servicioDe } from "./rutas.ts";

export default async function Servicio({ params, searchParams }: PropsDeEtapa) {
  await sesionExigida();
  const { id } = await params;
  const leido = await servicioDe(id);
  if (!leido.ok) {
    return null;
  }
  const consulta = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([nombre, valor]) =>
      (typeof valor === "string" ? [valor] : (valor ?? [])).map(
        (uno): [string, string] => [nombre, uno],
      ),
    ),
  ).toString();
  redirect(
    `${rutaDeEtapa(id, leido.servicio.etapa)}${consulta === "" ? "" : `?${consulta}`}`,
  );
}
