// Caso permitido de F0-24: fuera de src/ (scripts, tests) console.* sigue
// valiendo. Biome NO tiene que marcarlo.
export function avisar(texto: string): void {
  console.log(texto);
}
