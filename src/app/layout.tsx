import type { ReactNode } from "react";

/**
 * Layout raíz (F0-04). El App Router exige uno: es el mínimo, sin estilos
 * ni componentes. El "layout" de la aplicación (navegación, estilos) no es
 * de Fase 0.
 */
export default function LayoutRaiz({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
