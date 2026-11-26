import type { CambioAbm } from "../../casos-uso/abm/abm.ts";
import { Tabla } from "./tabla.tsx";

/** Cómo cambiaron los campos con historial; sin cambios, nada. */
export function Cambios({
  cambios,
}: {
  readonly cambios: readonly CambioAbm[];
}) {
  if (cambios.length === 0) {
    return null;
  }
  return (
    <section className="mt-8">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-texto-2 uppercase">
        Cambios
      </h3>
      <Tabla
        titulo="Cambios"
        cabeceras={["Cuándo", "Quién", "Campo", "De", "A"]}
      >
        {cambios.map(({ cuando, quien, campo, de, a }) => (
          <tr key={`${cuando}-${campo}-${de}-${a}`}>
            <td className="whitespace-nowrap text-texto-2">{cuando}</td>
            <td>{quien}</td>
            <td className="font-medium">{campo}</td>
            <td className="text-texto-2">{de}</td>
            <td>{a}</td>
          </tr>
        ))}
      </Tabla>
    </section>
  );
}
