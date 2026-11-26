import { ChevronDown } from "lucide-react";
import { type ComponentProps, useId } from "react";
import { CLASES_DE_CONTROL, ErrorDeCampo, Etiqueta } from "./campo-texto.tsx";
import { cn } from "./cn.ts";

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
  opcional,
  opciones,
  ...resto
}: {
  readonly etiqueta: string;
  readonly etiquetaOculta?: boolean | undefined;
  readonly error?: string | undefined;
  /** Se puede dejar sin elegir: la etiqueta lo dice con «opcional». */
  readonly opcional?: boolean | undefined;
  readonly opciones: readonly OpcionDeSelector[];
} & Omit<ComponentProps<"select">, "className" | "id" | "children">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Etiqueta htmlFor={id} opcional={opcional} oculta={etiquetaOculta}>
        {etiqueta}
      </Etiqueta>
      <span className="relative flex">
        <select
          id={id}
          className={cn(
            CLASES_DE_CONTROL,
            "cursor-pointer appearance-none pr-8",
          )}
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
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-texto-3"
        />
      </span>
      <ErrorDeCampo id={id} error={error} />
    </div>
  );
}
