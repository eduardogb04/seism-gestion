/**
 * Por qué no se pudo entrar (F0-31): el código del catálogo (`AUT-0001`,
 * `AUT-0002`...), su descripción y qué hacer. Nada del caso concreto.
 */

import { pantallaDeCodigo } from "../../../../casos-uso/sesion/errores.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ErrorDeIngreso({ searchParams }: Props) {
  const { codigo } = await searchParams;
  const error = pantallaDeCodigo(
    typeof codigo === "string" ? codigo : undefined,
  );
  return (
    <main>
      <h1>No se pudo entrar</h1>
      <p>
        <strong data-codigo-error>{error.codigo}</strong> · {error.mensaje}
      </p>
      <p>{error.queHacer}</p>
      <a href="/ingresar">Volver a entrar</a>
    </main>
  );
}
