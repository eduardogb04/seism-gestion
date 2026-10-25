/**
 * El marco de todo lo que está detrás del login: la barra lateral con las
 * secciones en tres grupos (F3-05), la cabecera con el tema, la persona y
 * *Salir*, y el contenido. Cada página lo renderiza **después** de su control
 * de acceso: un layout no alcanza para eso (AGENTS, *una página que exige
 * administrador*).
 */

import {
  Activity,
  Building2,
  CalendarDays,
  ChartPie,
  HandCoins,
  House,
  Landmark,
  Layers,
  type LucideIcon,
  MapPin,
  Receipt,
  Tags,
  TrendingUp,
  Truck,
  UserCog,
  Wallet,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { ETIQUETAS_ROL } from "../../casos-uso/usuarios/roles.ts";
import type { Rol } from "../../puertos/repositorios/usuarios.ts";
import { BarraLateral } from "./barra-lateral.tsx";
import { FormularioSalir } from "./formulario-salir.tsx";
import { SelectorDeTema } from "./selector-de-tema.tsx";

type Seccion = {
  readonly texto: string;
  readonly ruta: string;
  readonly Icono: LucideIcon;
  readonly soloAdministrador: boolean;
};

/** Las pantallas que existen, por grupo. Una sección nueva se suma acá, cuando exista su página. */
const GRUPOS: readonly {
  readonly nombre: string;
  readonly secciones: readonly Seccion[];
}[] = [
  {
    nombre: "Operación",
    secciones: [
      { texto: "Inicio", ruta: "/", Icono: House, soloAdministrador: false },
      {
        texto: "Servicios",
        ruta: "/servicios",
        Icono: Wrench,
        soloAdministrador: false,
      },
      {
        texto: "Calendario",
        ruta: "/calendario",
        Icono: CalendarDays,
        soloAdministrador: false,
      },
    ],
  },
  {
    nombre: "Finanzas",
    secciones: [
      {
        texto: "Ingresos",
        ruta: "/servicios/facturas",
        Icono: TrendingUp,
        soloAdministrador: false,
      },
      {
        texto: "Egresos",
        ruta: "/egresos",
        Icono: Receipt,
        soloAdministrador: false,
      },
      {
        texto: "Por cobrar",
        ruta: "/servicios/por-cobrar",
        Icono: HandCoins,
        soloAdministrador: false,
      },
      {
        texto: "Por pagar",
        ruta: "/egresos/pagos",
        Icono: Wallet,
        soloAdministrador: false,
      },
    ],
  },
  {
    nombre: "Configuración",
    secciones: [
      {
        texto: "Grupos",
        ruta: "/catalogo/grupos",
        Icono: Layers,
        soloAdministrador: false,
      },
      {
        texto: "Clientes y proveedores",
        ruta: "/catalogo/clientes",
        Icono: Building2,
        soloAdministrador: false,
      },
      {
        texto: "Sitios",
        ruta: "/catalogo/sitios",
        Icono: MapPin,
        soloAdministrador: false,
      },
      {
        texto: "Camiones",
        ruta: "/catalogo/camiones",
        Icono: Truck,
        soloAdministrador: false,
      },
      {
        texto: "Tipos de servicio",
        ruta: "/catalogo/tipos-de-servicio",
        Icono: Tags,
        soloAdministrador: false,
      },
      {
        texto: "Cuentas",
        ruta: "/catalogo/cuentas",
        Icono: Landmark,
        soloAdministrador: false,
      },
      {
        texto: "Centros de costo",
        ruta: "/catalogo/centros-de-costo",
        Icono: ChartPie,
        soloAdministrador: false,
      },
      {
        texto: "Usuarios",
        ruta: "/administracion/usuarios",
        Icono: UserCog,
        soloAdministrador: true,
      },
      {
        texto: "Salud",
        ruta: "/salud",
        Icono: Activity,
        soloAdministrador: true,
      },
    ],
  },
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
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* El fondo del menú llega hasta abajo aunque la barra quede fija arriba. */}
      <div className="bg-menu md:shrink-0">
        <BarraLateral>
          {GRUPOS.map(({ nombre, secciones }) => (
            <div
              key={nombre}
              className="mt-3 first:mt-0 md:group-data-[contraida=si]/menu:border-t md:group-data-[contraida=si]/menu:border-menu-activo md:group-data-[contraida=si]/menu:pt-3 md:group-data-[contraida=si]/menu:first:border-t-0"
            >
              <p
                id={`menu-${nombre}`}
                className="px-3 pb-1 text-xs font-semibold tracking-wide text-menu-texto-suave uppercase md:group-data-[contraida=si]/menu:sr-only"
              >
                {nombre}
              </p>
              <ul
                aria-labelledby={`menu-${nombre}`}
                className="flex flex-col gap-0.5"
              >
                {secciones
                  .filter(
                    ({ soloAdministrador }) =>
                      !soloAdministrador || rol === "administrador",
                  )
                  .map(({ texto, ruta, Icono }) => (
                    <li key={ruta}>
                      <a
                        href={ruta}
                        title={texto}
                        aria-current={ruta === rutaActual ? "page" : undefined}
                        className="flex min-h-10 items-center gap-3 rounded px-3 pointer-coarse:min-h-11 text-menu-texto no-underline motion-safe:transition-colors motion-safe:duration-150 hover:bg-menu-activo focus-visible:outline-menu-texto aria-[current=page]:bg-menu-activo aria-[current=page]:font-semibold md:group-data-[contraida=si]/menu:justify-center md:group-data-[contraida=si]/menu:px-0"
                      >
                        <Icono aria-hidden="true" className="size-5 shrink-0" />
                        <span className="md:group-data-[contraida=si]/menu:sr-only">
                          {texto}
                        </span>
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </BarraLateral>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-end gap-3 border-b border-borde bg-superficie px-4 py-2">
          <SelectorDeTema />
          <span className="text-texto-suave">
            {email} · {ETIQUETAS_ROL[rol]}
          </span>
          <FormularioSalir texto="Salir" />
        </header>
        <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
