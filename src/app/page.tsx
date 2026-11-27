/** Inicio: qué hay que hacer hoy, la plata pendiente, el mes en números y el embudo de servicios. */

import { armado } from "../infraestructura/arranque/armado.ts";
import { embudo } from "../server/inicio.ts";
import { Inicio } from "./_inicio/inicio.tsx";
import { Marco } from "./_ui/marco.tsx";
import { sesionExigida } from "./(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaginaDeInicio({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const [tablero, avisos, datosDelEmbudo] = await Promise.all([
    armado().tablero.tablero(await searchParams),
    armado().calendario.avisos({
      id: sesion.usuario.id,
      rol: sesion.usuario.rol,
    }),
    embudo(),
  ]);
  const { email, rol } = sesion.usuario;
  return (
    <Marco email={email} rol={rol}>
      <main>
        <Inicio
          email={email}
          tablero={tablero}
          avisos={avisos}
          embudo={datosDelEmbudo}
        />
      </main>
    </Marco>
  );
}
