/**
 * El avance de un servicio y de sus órdenes de compra (F2-07, ADR 0037): por
 * moneda y sin convertir, el total (sin IVA), lo facturado (con IVA), lo cobrado
 * y lo pendiente de cobro.
 */

import type { LineaDeAvance } from "../../../casos-uso/servicios/cobros.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";

export function LineasDeAvance({
  lineas,
}: {
  readonly lineas: readonly LineaDeAvance[];
}) {
  return (
    <ul>
      {lineas.map((linea) => (
        <li key={linea.moneda} data-avance-moneda={linea.moneda}>
          Total {linea.total} (sin IVA) · Facturado {linea.facturado} (con IVA)
          · Cobrado {linea.cobrado} · Pendiente de cobro {linea.pendiente}
        </li>
      ))}
    </ul>
  );
}

export async function Avance({ servicioId }: { readonly servicioId: string }) {
  const { servicio } = await armado().cobros.avance(servicioId);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xl font-semibold">Avance</h2>
      {servicio.length === 0 ? (
        <p>Todavía no hay órdenes de compra ni facturas.</p>
      ) : (
        <LineasDeAvance lineas={servicio} />
      )}
    </section>
  );
}
