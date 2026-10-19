import { cookies } from "next/headers.js";
import type { ReactNode } from "react";
import { preferenciasDe } from "./_ui/preferencias.ts";
import { ConPreferencias } from "./_ui/preferencias-en-pantalla.tsx";
import "./globales.css";

/**
 * Layout raíz: lo mínimo que exige el App Router, los estilos globales
 * (Tailwind, `globales.css`) y las preferencias del navegador (F3-05): el tema
 * va en `data-tema` desde el servidor, así la página llega ya con sus colores
 * y no parpadea. El marco de lo que está detrás del login no vive acá sino en
 * `_ui/marco.tsx`, que cada página renderiza después de su control de acceso.
 */
export default async function LayoutRaiz({
  children,
}: {
  readonly children: ReactNode;
}) {
  const guardadas = await cookies();
  const preferencias = preferenciasDe((nombre) => guardadas.get(nombre)?.value);
  return (
    <html lang="es" data-tema={preferencias.tema}>
      <body>
        <ConPreferencias preferencias={preferencias}>
          {children}
        </ConPreferencias>
      </body>
    </html>
  );
}
