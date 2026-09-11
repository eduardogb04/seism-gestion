// Viola `casos-uso-sin-afuera`: un caso de uso importa `@prisma/client`.
import { PrismaClient } from "@prisma/client";

export const cliente = new PrismaClient();
