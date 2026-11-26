/**
 * Una pieza del servicio (facturas, recursos, hitos…) dentro de una `Seccion`
 * del molde: sin su propio título, que ya lo pone la sección. Fuera del molde
 * (los paneles que todavía no lo usan) se dibuja como antes, con su título.
 */

import type { ReactNode } from "react";

export function Parte({
  enSeccion = false,
  titulo,
  children,
}: {
  readonly enSeccion?: boolean | undefined;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return enSeccion ? (
    <div className="min-w-0">{children}</div>
  ) : (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}
