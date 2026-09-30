// Fixture de F0-24: en src/ no se loguea con console.* (se usa el log de
// src/infraestructura/log.ts). Biome lo TIENE que rechazar (noConsole).
export function avisar(texto: string): void {
  console.log(texto);
}
