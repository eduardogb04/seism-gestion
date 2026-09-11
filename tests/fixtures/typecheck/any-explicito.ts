// Fixture: tiene que ser rechazado por el typecheck SOLO por el `any`
// explícito. Por lo demás es válido (sin variables sin usar, sin otros
// errores). No se corrige: `npm run typecheck:fixtures` lo prueba a propósito.

export function identidad(valor: any): any {
  return valor;
}
