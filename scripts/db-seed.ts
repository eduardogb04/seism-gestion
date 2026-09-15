/**
 * `npm run db:seed` (F0-10): valida el entorno igual que `db:migrate` y, si
 * pasa, corre el mecanismo de semilla (`prisma/seed.ts`) contra
 * `DATABASE_URL`, con el cliente de Prisma que arma
 * `src/adaptadores/prisma/cliente.ts` (con el adaptador `@prisma/adapter-pg`).
 *
 * Se niega a correr si `APP_ENTORNO=servidor` sin `SEED_PERMITIDO=si`, para
 * que nadie siembre datos de prueba en el servidor por accidente. No es una
 * variable del esquema de entorno (no hace falta para arrancar la app ni
 * ningún otro script de base): es un chequeo puntual de este script, igual
 * que `db-migrate-down.ts` exige `DATABASE_URL` local antes de revertir.
 */

import { existsSync } from "node:fs";
import process from "node:process";
import { sembrar } from "../prisma/seed.ts";
import { crearClientePrisma } from "../src/adaptadores/prisma/cliente.ts";
import { exigirEntornoValido } from "../src/infraestructura/entorno.ts";

const PROCESO = "db:seed";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const entorno = exigirEntornoValido(PROCESO);

if (entorno.APP_ENTORNO === "servidor" && process.env.SEED_PERMITIDO !== "si") {
  process.stderr.write(
    `${PROCESO}: APP_ENTORNO=servidor necesita SEED_PERMITIDO=si para sembrar datos de prueba (evita hacerlo por accidente en el servidor). No se ejecutó nada.\n`,
  );
  process.exit(1);
}

const prisma = crearClientePrisma(entorno.DATABASE_URL);
try {
  await sembrar(prisma);
  process.stdout.write(`${PROCESO}: listo.\n`);
} finally {
  await prisma.$disconnect();
}
