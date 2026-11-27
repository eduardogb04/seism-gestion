/**
 * El marco de todo lo que está detrás del login: la barra lateral (marca,
 * búsqueda Ctrl K, «Nuevo», secciones y persona) y el contenido. Cada página lo
 * dibuja **después** de su control de acceso. `rutaActual` se conserva por
 * compatibilidad: la sección activa la calcula la barra con la URL.
 */

import { type ReactNode, ViewTransition } from "react";
import { ETIQUETAS_ROL } from "../../casos-uso/usuarios/roles.ts";
import type { Rol } from "../../puertos/repositorios/usuarios.ts";
import { BarraLateral } from "./barra-lateral.tsx";

export function Marco({
  email,
  rol,
  children,
}: {
  readonly email: string;
  readonly rol: Rol;
  readonly rutaActual?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-h-dvh md:flex">
      <BarraLateral
        email={email}
        rolTexto={ETIQUETAS_ROL[rol]}
        esAdministrador={rol === "administrador"}
      />
      <div className="min-w-0 flex-1">
        {/* Solo anima al entrar o salir de una pantalla: un refresco de datos
            después de guardar no hace el fundido de todo el contenido (fix 13). */}
        <ViewTransition update="none">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </ViewTransition>
      </div>
    </div>
  );
}
