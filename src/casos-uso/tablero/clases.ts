import type { ClaseDeCentro } from "../../puertos/repositorios/tablero.ts";

/** Las tres clases de centro de costo, en el orden en que se muestran, y si lo que se gasta en ellas se devenga contra lo facturado. */
export const CLASES = [
  { clase: "proyecto", nombre: "Proyecto", devenga: true },
  {
    clase: "gestion_administrativa",
    nombre: "Gestión administrativa",
    devenga: true,
  },
  {
    clase: "fuera_de_rentabilidad",
    nombre: "Fuera de rentabilidad",
    devenga: false,
  },
] as const satisfies readonly {
  readonly clase: ClaseDeCentro;
  readonly nombre: string;
  readonly devenga: boolean;
}[];

export const devenga = (clase: ClaseDeCentro): boolean =>
  CLASES.find((c) => c.clase === clase)?.devenga === true;
