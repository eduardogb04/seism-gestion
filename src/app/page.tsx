/**
 * Inicio (F2-10, ADR 0038; F3-08, ADR 0042): cuánto entra y cuánto sale. El mes
 * del reloj, o el de `?mes=AAAA-MM`, en pesos o en dólares (`?moneda=ARS|USD`);
 * debajo, cada moneda por su lado y cada número, un enlace a su listado. HTML
 * del servidor, sin JavaScript de cliente.
 */

import { armado } from "../infraestructura/arranque/armado.ts";
import { Marco } from "./_ui/marco.tsx";
import { TableroDeInicio } from "./_ui/tablero-de-inicio.tsx";
import { sesionExigida } from "./(auth)/sesion-actual.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Inicio({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const tablero = await armado().tablero.tablero(await searchParams);
  const { email, rol } = sesion.usuario;
  return (
    <Marco email={email} rol={rol} rutaActual="/">
      <main>
        <TableroDeInicio tablero={tablero} />
      </main>
    </Marco>
  );
}
