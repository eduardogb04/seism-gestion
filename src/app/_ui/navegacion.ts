import {
  Activity,
  Building2,
  CalendarDays,
  ChartPie,
  HandCoins,
  House,
  Landmark,
  Layers,
  ListChecks,
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

export type Seccion = {
  readonly texto: string;
  readonly ruta: string;
  readonly Icono: LucideIcon;
  readonly soloAdministrador?: boolean;
  /** Letra del atajo `G` + letra. */
  readonly atajo?: string;
};

export type Grupo = {
  readonly nombre: string;
  readonly secciones: readonly Seccion[];
  /** Plegado en la barra salvo que se esté adentro. */
  readonly plegable?: boolean;
};

/** Las pantallas que existen, por grupo. Una sección nueva se suma acá. */
export const GRUPOS: readonly Grupo[] = [
  {
    nombre: "Operación",
    secciones: [
      { texto: "Inicio", ruta: "/", Icono: House, atajo: "i" },
      { texto: "Servicios", ruta: "/servicios", Icono: Wrench, atajo: "s" },
      {
        texto: "Calendario",
        ruta: "/calendario",
        Icono: CalendarDays,
        atajo: "c",
      },
      { texto: "Clientes", ruta: "/catalogo/clientes", Icono: Building2 },
    ],
  },
  {
    nombre: "Plata",
    secciones: [
      {
        texto: "Ingresos",
        ruta: "/servicios/facturas",
        Icono: TrendingUp,
        atajo: "f",
      },
      {
        texto: "Por cobrar",
        ruta: "/servicios/por-cobrar",
        Icono: HandCoins,
        atajo: "p",
      },
      { texto: "Egresos", ruta: "/egresos", Icono: Receipt, atajo: "e" },
      { texto: "Por pagar", ruta: "/egresos/pagos", Icono: Wallet },
    ],
  },
  {
    nombre: "Configuración",
    plegable: true,
    secciones: [
      { texto: "Grupos", ruta: "/catalogo/grupos", Icono: Layers },
      { texto: "Sitios", ruta: "/catalogo/sitios", Icono: MapPin },
      { texto: "Camiones", ruta: "/catalogo/camiones", Icono: Truck },
      {
        texto: "Tipos de servicio",
        ruta: "/catalogo/tipos-de-servicio",
        Icono: Tags,
      },
      {
        texto: "Plantillas de hitos",
        ruta: "/catalogo/plantillas-de-hitos",
        Icono: ListChecks,
      },
      { texto: "Cuentas", ruta: "/catalogo/cuentas", Icono: Landmark },
      {
        texto: "Centros de costo",
        ruta: "/catalogo/centros-de-costo",
        Icono: ChartPie,
      },
      {
        texto: "Usuarios",
        ruta: "/administracion/usuarios",
        Icono: UserCog,
        soloAdministrador: true,
      },
      {
        texto: "Salud del sistema",
        ruta: "/salud",
        Icono: Activity,
        soloAdministrador: true,
      },
    ],
  },
];

/** Lo que se puede crear desde «Nuevo» y desde la paleta. */
export const ALTAS = [
  { texto: "Servicio", ruta: "/servicios?nuevo=1", atajo: "N" },
  { texto: "Egreso", ruta: "/egresos?nuevo=1" },
  { texto: "Cliente o proveedor", ruta: "/catalogo/clientes?nuevo=1" },
] as const;

/** La sección activa: la de ruta más larga que contiene a la actual. */
export function rutaActiva(
  actual: string,
  rutas: readonly string[],
): string | undefined {
  return rutas
    .filter((r) =>
      r === "/" ? actual === "/" : actual === r || actual.startsWith(`${r}/`),
    )
    .sort((a, b) => b.length - a.length)[0];
}

export function seccionesVisibles(esAdministrador: boolean): readonly Grupo[] {
  return GRUPOS.map((g) => ({
    ...g,
    secciones: g.secciones.filter(
      (s) => !s.soloAdministrador || esAdministrador,
    ),
  }));
}
