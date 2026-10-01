import { type ComponentProps, useId } from "react";

export type OpcionDeSelector = {
  readonly valor: string;
  readonly texto: string;
};

/**
 * Un `<select>` nativo con su etiqueta enlazada. `etiquetaOculta` la deja solo
 * para lectores de pantalla (el selector de una fila de tabla).
 */
export function Selector({
  etiqueta,
  etiquetaOculta = false,
  opciones,
  ...resto
}: {
  readonly etiqueta: string;
  readonly etiquetaOculta?: boolean | undefined;
  readonly opciones: readonly OpcionDeSelector[];
} & Omit<ComponentProps<"select">, "className" | "id" | "children">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={etiquetaOculta ? "sr-only" : "font-medium"}
      >
        {etiqueta}
      </label>
      <select
        id={id}
        className="rounded border border-gray-300 bg-white px-3 py-2"
        {...resto}
      >
        {opciones.map(({ valor, texto }) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </select>
    </div>
  );
}
