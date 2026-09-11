export type Entidad = { readonly id: string };

export const crearEntidad = (id: string): Entidad => ({ id });
