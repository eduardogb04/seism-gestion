// Caso permitido: el mismo código, fuera de `src/dominio/`. La regla del
// reloj (F0-18) está acotada al dominio —traducir entre la fecha del sistema
// y el dominio es trabajo de los adaptadores—, así que este archivo NO tiene
// que aparecer como violación. Si apareciera, la regla se pasó de alcance y
// `npm run lint:fixtures` lo dice.

export function ahoraEnMilisegundos(): number {
  return Date.now();
}

export function anioDelSistema(): number {
  return new Date().getFullYear();
}
