/**
 * Una persona (FRONT_SPEC §5): avatar con iniciales y nombre. Lo que llega del
 * servidor suele ser el email de quien cargó algo; nunca se muestra el email
 * como nombre, se arma uno con la parte de antes de la arroba.
 */

import { cn } from "../../../_ui/cn.ts";

/** «juan.perez@x.com» → «Juan Perez»; un nombre ya escrito queda como está. */
export function nombreDePersona(quien: string): string {
  if (!quien.includes("@")) {
    return quien;
  }
  return (quien.split("@")[0] ?? "")
    .split(/[._-]+/)
    .filter((parte) => parte !== "")
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
}

function iniciales(nombre: string): string {
  const partes = nombre.split(/\s+/).filter((parte) => parte !== "");
  const letras =
    partes.length > 1
      ? `${partes[0]?.[0] ?? ""}${partes.at(-1)?.[0] ?? ""}`
      : nombre.slice(0, 2);
  return letras.toUpperCase();
}

export function Persona({
  quien,
  chica = false,
  className,
}: {
  readonly quien: string;
  readonly chica?: boolean;
  readonly className?: string;
}) {
  const nombre = nombreDePersona(quien);
  if (nombre === "") {
    return <span className="text-texto-3">Sin asignar</span>;
  }
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      title={quien.includes("@") ? quien : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-acento-suave font-semibold text-acento",
          chica ? "size-5 text-[9px]" : "size-6 text-[10px]",
        )}
      >
        {iniciales(nombre)}
      </span>
      <span className="truncate">{nombre}</span>
    </span>
  );
}
