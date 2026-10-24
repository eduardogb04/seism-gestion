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
    <section className="mt-6">
      <h3 className="mb-2 font-semibold">Cambios</h3>
      <Tabla cabeceras={["Cuándo", "Quién", "Campo", "De", "A"]}>
        {cambios.map(({ cuando, quien, campo, de, a }) => (
          <tr key={`${cuando}-${campo}-${de}-${a}`}>
            <td>{cuando}</td>
            <td>{quien}</td>
            <td>{campo}</td>
            <td>{de}</td>
            <td>{a}</td>
          </tr>
        ))}
      </Tabla>
    </section>
  );
}
