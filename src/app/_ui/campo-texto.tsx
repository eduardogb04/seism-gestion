import { type ComponentProps, type ReactNode, useId } from "react";

type PropsDeCampo = {
  readonly etiqueta: string;
  /** Lo que la persona tiene que corregir en este campo: va debajo, pegado a él. */
  readonly error?: string | undefined;
};

function Campo({
  id,
  etiqueta,
  error,
  children,
}: PropsDeCampo & { readonly id: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {etiqueta}
      </label>
      {children}
      {error === undefined ? null : (
        <p id={`${id}-error`} data-error-de-campo className="text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function atributos(id: string, error: string | undefined) {
  return {
    id,
    className:
      "rounded border border-gray-300 bg-white px-3 py-2 aria-invalid:border-red-700",
    "aria-invalid": error !== undefined,
    "aria-describedby": error === undefined ? undefined : `${id}-error`,
  };
}

export function CampoTexto({
  etiqueta,
  error,
  ...resto
}: PropsDeCampo & Omit<ComponentProps<"input">, "className" | "id">) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} error={error}>
      <input {...atributos(id, error)} {...resto} />
    </Campo>
  );
}

/** Una casilla de sí/no: marcada manda su `value`, desmarcada no manda nada. */
export function CasillaSiNo({
  etiqueta,
  error,
  ...resto
}: PropsDeCampo & Omit<ComponentProps<"input">, "className" | "id" | "type">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          id={id}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          {...resto}
        />
        <label htmlFor={id} className="font-medium">
          {etiqueta}
        </label>
      </div>
      {error === undefined ? null : (
        <p id={`${id}-error`} data-error-de-campo className="text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export function CampoTextoLargo({
  etiqueta,
  error,
  ...resto
}: PropsDeCampo & Omit<ComponentProps<"textarea">, "className" | "id">) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} error={error}>
      <textarea rows={4} {...atributos(id, error)} {...resto} />
    </Campo>
  );
}
