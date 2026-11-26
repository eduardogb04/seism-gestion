"use client";

import { Toaster } from "sonner";
import { usePreferencias } from "./preferencias-en-pantalla.tsx";

/** Los avisos (toasts) de toda la app: abajo a la derecha, con el tema elegido. */
export function Avisos() {
  const { tema } = usePreferencias();
  return (
    <Toaster
      position="bottom-right"
      theme={tema === "claro" ? "light" : tema === "oscuro" ? "dark" : "system"}
      toastOptions={{
        classNames: {
          toast:
            "!bg-superficie !text-texto !border-borde !shadow-flota !rounded-[10px] !font-sans",
          description: "!text-texto-2",
        },
      }}
    />
  );
}
