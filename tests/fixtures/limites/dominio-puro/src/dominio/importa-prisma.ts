// Viola `dominio-puro`: el dominio importa un paquete npm. `@prisma/client`
// ni siquiera está instalado: la regla lo atrapa igual.
import { PrismaClient } from "@prisma/client";

export const cliente = new PrismaClient();
