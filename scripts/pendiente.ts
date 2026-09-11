/**
 * Placeholder para comandos cuya herramienta todavía no llegó al proyecto
 * (decisión del orquestador para F0-01). Imprime qué tarea la trae y sale 0:
 * el comando existe, pero no hace nada real todavía.
 *
 * Uso: node scripts/pendiente.ts <comando> <tarea>
 */

const comando = process.argv[2];
const tarea = process.argv[3];

if (comando === undefined || tarea === undefined) {
  console.error("Uso: node scripts/pendiente.ts <comando> <tarea>");
  process.exit(1);
}

console.log(`'${comando}' todavía no tiene herramienta propia: llega en ${tarea}. No hace nada por ahora.`);
process.exit(0);
