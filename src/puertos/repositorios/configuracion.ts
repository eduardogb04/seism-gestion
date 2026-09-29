/**
 * Lectura de la tabla `configuracion` (F0-28): los parámetros que se cambian
 * sin redeploy, como el tope de gasto de IA. Implementado con Prisma en
 * `src/adaptadores/prisma/configuracion.ts`. Las claves las siembra
 * `prisma/seed.ts`.
 */
export type LectorConfiguracion = {
  /** El valor de la clave, o `null` si no existe. Quien lo lee lo convierte. */
  leer(clave: string): Promise<string | null>;
};
