"use client";

import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

/**
 * El `<button>` de `Boton`. Si es de envío, muestra la rueda y se deshabilita
 * mientras su formulario se procesa: la persona ve al instante que el sistema
 * está trabajando (fix 13).
 */
export function BotonConEstado({
  clases,
  cargando,
  disabled,
  children,
  ...resto
}: {
  readonly clases: string;
  readonly cargando: boolean;
} & Omit<ComponentProps<"button">, "className">) {
  const { pending } = useFormStatus();
  const ocupado = cargando || (resto.type === "submit" && pending);
  return (
    <button
      className={clases}
      disabled={disabled === true || ocupado}
      aria-busy={ocupado || undefined}
      {...resto}
    >
      {ocupado ? (
        <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
      ) : null}
      {children}
    </button>
  );
}
