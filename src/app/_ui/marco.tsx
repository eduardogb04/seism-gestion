/**
 * El marco de todo lo que está detrás del login: menú a la izquierda (arriba
 * en el celular, solo con CSS), cabecera con la persona y *Salir*, y el
 * contenido. Cada página lo renderiza **después** de su control de acceso: un
 * layout no alcanza para eso (AGENTS, *una página que exige administrador*).
 */

import type { ReactNode } from "react";
import { ETIQUETAS_ROL } from "../../casos-uso/usuarios/roles.ts";
import type { Rol } from "../../puertos/repositorios/usuarios.ts";
import { FormularioSalir } from "./formulario-salir.tsx";

type Seccion = {
  readonly texto: string;
  readonly ruta: string;
  readonly soloAdministrador: boolean;
};

/** Las pantallas que existen. Una sección nueva se suma acá, cuando exista su página. */
const SECCIONES: readonly Seccion[] = [
  { texto: "Egresos", ruta: "/egresos", soloAdministrador: false },
  { texto: "Grupos", ruta: "/catalogo/grupos", soloAdministrador: false },
  {
    texto: "Clientes y proveedores",
    ruta: "/catalogo/clientes",
    soloAdministrador: false,
  },
  { texto: "Sitios", ruta: "/catalogo/sitios", soloAdministrador: false },
  { texto: "Camiones", ruta: "/catalogo/camiones", soloAdministrador: false },
  {
    texto: "Tipos de servicio",
    ruta: "/catalogo/tipos-de-servicio",
    soloAdministrador: false,
  },
  { texto: "Cuentas", ruta: "/catalogo/cuentas", soloAdministrador: false },
  {
    texto: "Centros de costo",
    ruta: "/catalogo/centros-de-costo",
    soloAdministrador: false,
  },
  {
    texto: "Usuarios",
    ruta: "/administracion/usuarios",
    soloAdministrador: true,
  },
  { texto: "Salud", ruta: "/salud", soloAdministrador: true },
];

export function Marco({
  email,
  rol,
  rutaActual,
  children,
}: {
  readonly email: string;
  readonly rol: Rol;
  readonly rutaActual: string;
  readonly children: ReactNode;
}) {
  const visibles = SECCIONES.filter(
    ({ soloAdministrador }) => !soloAdministrador || rol === "administrador",
  );
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav
        aria-label="Secciones"
        className="bg-menu text-white md:w-56 md:shrink-0"
      >
        <p className="px-4 py-3 text-lg font-semibold">SeisM</p>
        <ul className="flex flex-wrap gap-1 px-2 pb-2 md:flex-col">
          {visibles.map(({ texto, ruta }) => (
            <li key={ruta}>
              <a
                href={ruta}
                aria-current={ruta === rutaActual ? "page" : undefined}
                className="block rounded px-3 py-2 text-white no-underline hover:bg-white/10 aria-[current=page]:bg-white/20 aria-[current=page]:font-semibold"
              >
                {texto}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-end gap-3 border-b border-gray-200 bg-white px-4 py-2">
          <span>
            {email} · {ETIQUETAS_ROL[rol]}
          </span>
          <FormularioSalir texto="Salir" />
        </header>
        <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
