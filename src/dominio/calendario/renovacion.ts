/**
 * Los avisos de renovación de un contrato recurrente (SYSTEM_SPEC §5.4): a los
 * 60, 45 y 30 días del fin de vigencia, para empezar la charla con el cliente.
 */

export type EtapaDeRenovacion = 60 | 45 | 30;

/** Los días desde los que se avisa una renovación. */
export const DIAS_DE_AVISO_DE_RENOVACION: EtapaDeRenovacion = 60;

/** La etapa del aviso según los días que faltan (vencido = 30), o `null` si falta más de 60. */
export function etapaDeRenovacion(
  diasQueFaltan: number,
): EtapaDeRenovacion | null {
  if (diasQueFaltan <= 30) return 30;
  if (diasQueFaltan <= 45) return 45;
  if (diasQueFaltan <= 60) return 60;
  return null;
}
