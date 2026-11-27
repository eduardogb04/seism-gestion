import { FileText } from "lucide-react";
import { cn } from "./cn.ts";

/**
 * El ícono que abre en una pestaña nueva el documento que respalda una factura,
 * un cobro o un egreso (`/documentos/<id>?ver=1`: se ve en el navegador, no se
 * descarga). Sin documento no se dibuja. Es un `<a>` común: lo que vuelve es un
 * archivo, no una página.
 */
export function IconoDeDocumento({
  id,
  className,
}: {
  readonly id: string | null | undefined;
  readonly className?: string;
}) {
  if (id === null || id === undefined) {
    return null;
  }
  return (
    <a
      href={`/documentos/${id}?ver=1`}
      target="_blank"
      rel="noopener"
      aria-label="Ver documento"
      title="Ver documento"
      className={cn(
        "presionable relative z-10 inline-grid size-8 shrink-0 place-items-center rounded-md text-texto-2 no-underline hover:bg-superficie-3 hover:text-texto pointer-coarse:size-11",
        className,
      )}
    >
      <FileText aria-hidden="true" className="size-4" />
    </a>
  );
}
