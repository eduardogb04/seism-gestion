/**
 * CUIT: 11 dígitos, los dos primeros el tipo de persona y el último un
 * verificador (módulo 11). Se guarda normalizado, sin guiones, y se muestra
 * como `XX-XXXXXXXX-X`.
 */

const FORMA = /^(\d{2})-?(\d{8})-?(\d)$/;
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Los 11 dígitos de `texto` (con guiones o sin ellos), o `null` si no tiene la
 * forma de un CUIT o su dígito verificador no corresponde. Un cuerpo cuyo
 * cálculo da resto 1 no tiene dígito posible: nunca es válido.
 */
export function normalizarCuit(texto: string): string | null {
  const partes = FORMA.exec(texto.trim());
  if (partes === null) {
    return null;
  }
  const cuit = partes.slice(1).join("");
  const suma = PESOS.reduce(
    (total, peso, i) => total + peso * Number(cuit[i]),
    0,
  );
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : 11 - resto;
  return resto !== 1 && verificador === Number(cuit[10]) ? cuit : null;
}

/** `30000000015` → `30-00000001-5`. */
export function formatearCuit(cuit: string): string {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
