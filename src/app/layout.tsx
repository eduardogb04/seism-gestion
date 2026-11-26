import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers.js";
import type { ReactNode } from "react";
import { Avisos } from "./_ui/avisos.tsx";
import { preferenciasDe } from "./_ui/preferencias.ts";
import { ConPreferencias } from "./_ui/preferencias-en-pantalla.tsx";
import "./globales.css";

export const metadata = {
  title: { default: "SeisM", template: "%s · SeisM" },
};

/**
 * Layout raíz: estilos, tipografía Geist y preferencias (el tema llega en
 * `data-tema` desde el servidor, sin parpadeo). El marco de lo que está detrás
 * del login vive en `_ui/marco.tsx`, que cada página dibuja tras su control de acceso.
 */
export default async function LayoutRaiz({
  children,
}: {
  readonly children: ReactNode;
}) {
  const guardadas = await cookies();
  const preferencias = preferenciasDe((nombre) => guardadas.get(nombre)?.value);
  return (
    <html
      lang="es-AR"
      data-tema={preferencias.tema}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <ConPreferencias preferencias={preferencias}>
          {children}
          <Avisos />
        </ConPreferencias>
      </body>
    </html>
  );
}
