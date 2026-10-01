import type { ReactNode } from "react";

/**
 * Cabecera y filas. Las filas (`<tr>`) las arma quien la usa; el estilo de las
 * celdas lo da la tabla. En pantallas angostas hace scroll dentro de su
 * contenedor, no de la página.
 */
export function Tabla({
  cabeceras,
  children,
}: {
  readonly cabeceras: readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="w-full border-collapse text-left [&_td]:border-t [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_th]:bg-gray-100 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
        <thead>
          <tr>
            {cabeceras.map((cabecera) => (
              <th key={cabecera}>{cabecera}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
