import type { ReactNode } from "react";

/** El contenido de las pantallas sin marco (entrar, errores de entrada): una tarjeta centrada. */
export function Tarjeta({ children }: { readonly children: ReactNode }) {
  return (
    <main className="mx-auto mt-8 w-full max-w-md rounded border border-gray-200 bg-white p-6 shadow-sm sm:mt-16">
      {children}
    </main>
  );
}
