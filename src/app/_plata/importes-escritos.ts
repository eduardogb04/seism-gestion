/**
 * Sumar importes que ya vienen escritos (`ARS 1.234,56`): los totales al pie de
 * un listado por moneda, sin volver a pedirle los números al servidor.
 */

/** Los centavos de un texto `ARS 1.234,56`. */
export function centavosDe(texto: string): bigint {
  const digitos = texto.replace(/[^\d-]/g, "");
  return BigInt(digitos === "" ? "0" : digitos);
}

/** `1234567n` como `12.345,67`. */
export function montoDe(centavos: bigint): string {
  const negativo = centavos < 0n;
  const positivo = negativo ? -centavos : centavos;
  const enteros = (positivo / 100n)
    .toString()
    .replace(/\B(?=([0-9]{3})+$)/g, ".");
  const decimales = (positivo % 100n).toString().padStart(2, "0");
  return `${negativo ? "-" : ""}${enteros},${decimales}`;
}

/** Los importes escritos sumados por moneda, ya escritos: `["ARS 3.000,00", "USD 10,00"]`. */
export function sumarPorMoneda(textos: readonly string[]): readonly string[] {
  const porMoneda = new Map<string, bigint>();
  for (const texto of textos) {
    const moneda = texto.split(" ")[0] ?? "";
    porMoneda.set(moneda, (porMoneda.get(moneda) ?? 0n) + centavosDe(texto));
  }
  return [...porMoneda].map(
    ([moneda, centavos]) => `${moneda} ${montoDe(centavos)}`,
  );
}
