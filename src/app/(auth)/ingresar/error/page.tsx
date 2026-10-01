/**
 * Por qué no se pudo entrar (F0-31): el código del catálogo (`AUT-0001`,
 * `AUT-0002`...), su descripción y qué hacer. Nada del caso concreto.
 */

import { pantallaDeCodigo } from "../../../../casos-uso/sesion/errores.ts";
import { ErrorEnPantalla } from "../../../_ui/error-en-pantalla.tsx";
import { Tarjeta } from "../../../_ui/tarjeta.tsx";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ErrorDeIngreso({ searchParams }: Props) {
  const { codigo } = await searchParams;
  const error = pantallaDeCodigo(
    typeof codigo === "string" ? codigo : undefined,
  );
  return (
    <Tarjeta>
      <h1>No se pudo entrar</h1>
      <ErrorEnPantalla error={error} />
      <a href="/ingresar">Volver a entrar</a>
    </Tarjeta>
  );
}
