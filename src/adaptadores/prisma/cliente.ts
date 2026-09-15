/**
 * Instancia el cliente de Prisma (F0-10). Prisma 7 ya no trae un driver por
 * defecto: hay que armar el cliente con un adaptador. Este es el primer
 * código del repo que se conecta de verdad a Postgres (hasta acá, `db:migrate`
 * y `db:migrate:down` corrían la CLI de Prisma o `psql` por su cuenta, sin
 * pasar por el cliente generado).
 *
 * Vive acá, en `src/adaptadores/prisma/`, junto al cliente generado (ADR
 * 0008): es el único lugar del diseño donde puede vivir Prisma.
 * dependency-cruiser no deja importar este archivo desde `dominio`,
 * `puertos` ni `casos-uso`; desde `app` o `worker` solo se llega por
 * `src/infraestructura/arranque/`.
 *
 * No valida `urlBase`: quien llama ya la validó contra el esquema de entorno
 * (`exigirEntornoValido`, en los scripts `db:*`).
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generado/client.ts";

/** Un cliente de Prisma nuevo, conectado a `urlBase` con el driver de `pg`. */
export function crearClientePrisma(urlBase: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlBase }),
  });
}
