/**
 * `db:migrate` existe desde F0-01 (lo pide el criterio de aceptación) pero
 * todavía no hay ni base ni Prisma: eso llega en el lote 2 (F0-08). Hasta
 * entonces, el comando sale en error con un mensaje claro en vez de fallar
 * de forma críptica.
 */

console.error(
  "db:migrate: todavía no hay esquema ni Prisma configurados (llegan en el lote 2, tarea F0-08). Nada que migrar.",
);
process.exit(1);
