import { cn } from "./cn.ts";

const TONO = {
  60: "text-texto-2",
  45: "text-aviso",
  30: "text-peligro",
} as const;

/** La etiqueta chica «Aviso de 60 días» de la renovación de un contrato. */
export function EtapaDeRenovacion({
  etapa,
}: {
  readonly etapa: 60 | 45 | 30 | null | undefined;
}) {
  if (etapa == null) return null;
  return (
    <span className={cn("block text-xs font-medium", TONO[etapa])}>
      Aviso de {etapa} días
    </span>
  );
}
