/**
 * El repositorio de facturas de un servicio (F2-06, ADR 0036). La fila se lee y
 * se escribe como la de cualquier ABM (con su auditoría). Guarda el importe
 * **sin IVA** y la alícuota: el IVA y el total no se guardan, se calculan con
 * `src/dominio/servicios/factura.ts`.
 *
 * Implementado con Prisma en `src/adaptadores/prisma/facturas.ts`.
 */

import type { Importe, Moneda } from "../../dominio/compartido/importe.ts";
import type { AlicuotaIva } from "../../dominio/servicios/factura.ts";
import type { RegistroDe, RepositorioDe } from "./abm.ts";

export type DatosFactura = {
  readonly servicioId: string;
  readonly ordenCompraId: string | null;
  readonly numero: string;
  /** Un día, `aaaa-mm-dd`. */
  readonly fecha: string;
  /** Un día, `aaaa-mm-dd`. */
  readonly vencimiento: string;
  /** Sin IVA. */
  readonly importe: Importe<Moneda>;
  readonly alicuota: AlicuotaIva;
  readonly documentoId: string | null;
};

export type Factura = RegistroDe<DatosFactura>;

export type RepositorioFacturas = Pick<
  RepositorioDe<DatosFactura>,
  "buscarPorId" | "crear" | "actualizar"
> & {
  /** Las no anuladas de un servicio, de la más nueva a la más vieja. */
  listarDe(servicioId: string): Promise<readonly Factura[]>;
  /** Si hay una factura vigente con ese número (sin distinguir mayúsculas), de cualquier servicio. */
  existeNumero(numero: string): Promise<boolean>;
};
