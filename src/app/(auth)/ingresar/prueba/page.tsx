/**
 * La pantalla de la identidad falsa (F0-31): lista los emails de prueba y
 * cada uno vuelve al callback con su código y el `state` del login. Solo
 * existe con `IDENTIDAD=falsa` (que el esquema del entorno no acepta en el
 * servidor); con Google, 404.
 */

import { notFound, redirect } from "next/navigation.js";
import { armado } from "../../../../infraestructura/arranque/armado.ts";
import { Tarjeta } from "../../../_ui/tarjeta.tsx";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PantallaDePrueba({ searchParams }: Props) {
  const { state } = await searchParams;
  const { pruebas } = armado();
  if (pruebas === null) {
    notFound();
  }
  if (typeof state !== "string" || state === "") {
    redirect("/ingresar");
  }
  return (
    <Tarjeta>
      <h1>Identidad de prueba</h1>
      <p className="mb-4">
        Solo para desarrollo y pruebas: elegí con qué email entrar. En el
        servidor se entra con Google.
      </p>
      <ul className="space-y-2">
        {pruebas.emails.map((email) => (
          <li key={email}>
            <a
              href={`/ingresar/callback?${new URLSearchParams({
                code: pruebas.codigoPara(email),
                state,
              })}`}
            >
              {email}
            </a>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
