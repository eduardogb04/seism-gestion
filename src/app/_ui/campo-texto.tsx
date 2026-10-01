import { type ComponentProps, useId } from "react";

export function CampoTexto({
  etiqueta,
  ...resto
}: { readonly etiqueta: string } & Omit<
  ComponentProps<"input">,
  "className" | "id"
>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        className="rounded border border-gray-300 bg-white px-3 py-2"
        {...resto}
      />
    </div>
  );
}
