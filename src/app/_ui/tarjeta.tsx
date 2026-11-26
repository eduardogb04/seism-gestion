import type { ReactNode } from "react";

/** El contenido de las pantallas sin marco (entrar, errores de entrada): una tarjeta centrada. */
export function Tarjeta({ children }: { readonly children: ReactNode }) {
  return (
    <main className="aparece mx-auto mt-10 w-full max-w-md rounded-tarjeta border border-borde bg-superficie p-6 shadow-tarjeta sm:mt-20 sm:p-8">
      {children}
    </main>
  );
}
