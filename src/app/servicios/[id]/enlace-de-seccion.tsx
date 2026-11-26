/** Un enlace chico a la derecha del título de una `Seccion` que abre una ventana (`?hito=1`). */

import { Plus } from "lucide-react";
import { Enlace } from "../../_ui/enlace-next.ts";

export function EnlaceDeSeccion({
  texto,
  href,
  carga,
}: {
  readonly texto: string;
  readonly href: string;
  readonly carga: string;
}) {
  return (
    <Enlace
      href={href}
      scroll={false}
      data-carga={carga}
      className="inline-flex items-center gap-1 text-[13px] font-medium no-underline hover:underline"
    >
      <Plus aria-hidden="true" className="size-3.5" />
      {texto}
    </Enlace>
  );
}
