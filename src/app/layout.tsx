import type { ReactNode } from "react";
import "./globales.css";

/**
 * Layout raíz: lo mínimo que exige el App Router más los estilos globales
 * (Tailwind, `globales.css`). El marco de lo que está detrás del login no vive
 * acá sino en `_ui/marco.tsx`, que cada página renderiza después de su control
 * de acceso.
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
