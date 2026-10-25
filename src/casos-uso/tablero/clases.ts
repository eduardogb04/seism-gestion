import type { ClaseDeCentro } from "../../puertos/repositorios/tablero.ts";

/** Lo que se gasta en un centro de proyecto o de gestión administrativa se devenga contra lo facturado; lo de fuera de rentabilidad, no. */
export const devenga = (clase: ClaseDeCentro): boolean =>
  clase !== "fuera_de_rentabilidad";
