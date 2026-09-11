// Fixture: tiene que ser rechazado por el typecheck SOLO por la variable sin
// usar (`noUnusedLocals`). Por lo demás es válido (sin `any`, sin otros
// errores). No se corrige: `npm run typecheck:fixtures` lo prueba a propósito.

export function saludar(nombre: string): string {
  const sinUsar = 42;
  return `hola ${nombre}`;
}
