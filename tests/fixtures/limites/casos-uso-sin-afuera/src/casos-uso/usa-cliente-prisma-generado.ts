// Viola `casos-uso-sin-afuera`: un caso de uso importa el cliente que genera
// Prisma adentro de `src/adaptadores/prisma/` (F0-08, ADR 0008).
import { PrismaClient } from "../adaptadores/prisma/generado/client.ts";

export const cliente = new PrismaClient();
