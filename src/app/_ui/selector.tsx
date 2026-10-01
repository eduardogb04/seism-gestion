import { type ComponentProps, useId } from "react";

export type OpcionDeSelector = {
  readonly valor: string;
  readonly texto: string;
};

/**
 * Un `<select>` nativo con su etiqueta enlazada. `etiquetaOculta` la deja solo
 * para lectores de pantalla (el selector de una fila de tabla). `error` es lo
 * que la persona tiene que corregir: va debajo, pegado al selector.
 */
export function Selector({
  etiqueta,
  etiquetaOculta = false,
  error,
  opciones,
  ...resto
}: {
  readonly etiqueta: string;
  readonly etiquetaOculta?: boolean | undefined;
  readonly error?: string | undefined;
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
        className="rounded border border-gray-300 bg-white px-3 py-2 aria-invalid:border-red-700"
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        {...resto}
      >
        {opciones.map(({ valor, texto }) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </select>
      {error === undefined ? null : (
        <p id={`${id}-error`} data-error-de-campo className="text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
