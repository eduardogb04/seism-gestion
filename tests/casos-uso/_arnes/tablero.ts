/**
 * Las altas que arman las bases de los tests del tablero (F2-10, F3-08):
 * facturas, cobros, egresos y pagos por los casos de uso de verdad. Datos
 * inventados. El contexto se pide perezoso porque el cliente y el almacén
 * recién existen en el `beforeAll` del test.
 */

import type { crearGeneradorIdCrypto } from "../../../src/adaptadores/memoria/generador-id.ts";
import { crearCasosUsoAbm } from "../../../src/casos-uso/abm/abm.ts";
import { CENTROS_DE_COSTO } from "../../../src/casos-uso/abm/centros-de-costo.ts";
import { CUENTAS } from "../../../src/casos-uso/abm/cuentas.ts";
import { EGRESOS } from "../../../src/casos-uso/abm/egresos.ts";
import { crearCasosUsoPagos } from "../../../src/casos-uso/egresos/pagos.ts";
import { crearCasosUsoCobros } from "../../../src/casos-uso/servicios/cobros.ts";
import { crearCasosUsoFacturas } from "../../../src/casos-uso/servicios/facturas.ts";
import type { Actor } from "../../../src/dominio/compartido/actor.ts";
import type { Moneda } from "../../../src/dominio/compartido/importe.ts";
import type { Reloj } from "../../../src/dominio/compartido/reloj.ts";
import { nuevaClaveDocumento } from "../../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../../src/puertos/almacen-documentos.ts";
import type { Transaccional } from "../../../src/puertos/repositorios/transaccion.ts";
import { conCambioSiEsEnDolares } from "./tipo-de-cambio.ts";

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: ReturnType<typeof crearGeneradorIdCrypto>;
};

export type ContextoDelTablero = {
  readonly dependencias: () => Dependencias;
  readonly admin: () => Actor;
  readonly almacen: () => AlmacenDocumentos;
};

export type DatosDeFactura = {
  readonly numero: string;
  readonly fecha: string;
  readonly vencimiento: string;
  readonly importe: string;
  readonly moneda?: Moneda;
  readonly alicuota?: "210" | "105" | "0";
  /** El tipo de cambio de una factura en dólares; sin esto, el de ejemplo. */
  readonly cambio?: string;
};

export type DatosDeEgreso = {
  readonly centroCostoId: string;
  readonly fecha: string;
  readonly importe: string;
  readonly moneda?: Moneda;
  readonly vencimiento?: string;
  readonly servicioId?: string;
  /** El tipo de cambio de un egreso en dólares; sin esto, el de ejemplo. */
  readonly cambio?: string;
};

/** El resultado de un alta que tiene que pasar, o el test se cae con lo que faltó. */
export function pasa<T extends { readonly ok: boolean }>(
  resultado: T,
  que: string,
): Extract<T, { ok: true }> {
  if (!resultado.ok) {
    throw new Error(`${que} no pasó: ${JSON.stringify(resultado)}`);
  }
  return resultado as Extract<T, { ok: true }>;
}

export function ayudasDelTablero(contexto: ContextoDelTablero) {
  const abm = () => crearCasosUsoAbm(contexto.dependencias());
  const adjuntos = () => ({
    ...contexto.dependencias(),
    almacen: contexto.almacen(),
    nuevaClave: nuevaClaveDocumento,
  });

  return {
    async altaDeCentro(nombre: string, clase: string): Promise<string> {
      const resultado = await abm().crear(contexto.admin(), CENTROS_DE_COSTO, {
        nombre,
        clase,
        descripcion: "",
        activo: "si",
      });
      return pasa(resultado, "el centro").registro.valor.id;
    },

    async altaDeCuenta(nombre: string, moneda: Moneda): Promise<string> {
      const resultado = await abm().crear(contexto.admin(), CUENTAS, {
        nombre,
        tipo: "banco",
        moneda,
        observaciones: "",
        activa: "si",
      });
      return pasa(resultado, "la cuenta").registro.valor.id;
    },

    async cargarFactura(
      servicioId: string,
      datos: DatosDeFactura,
    ): Promise<string> {
      const resultado = await crearCasosUsoFacturas(adjuntos()).crear(
        contexto.admin(),
        servicioId,
        conCambioSiEsEnDolares({
          numero: datos.numero,
          fecha: datos.fecha,
          vencimiento: datos.vencimiento,
          importe: datos.importe,
          importeMoneda: datos.moneda ?? "ARS",
          alicuota: datos.alicuota ?? "210",
          ordenCompraId: "",
          ...(datos.cambio === undefined ? {} : { cambio: datos.cambio }),
        }),
        null,
      );
      return pasa(resultado, `la factura ${datos.numero}`).id;
    },

    async cobrar(
      facturaId: string,
      cuentaId: string,
      dia: string,
      importe: string,
      retencion = "",
    ): Promise<void> {
      pasa(
        await crearCasosUsoCobros(adjuntos()).registrar(
          contexto.admin(),
          facturaId,
          {
            fecha: dia,
            importe,
            retencion,
            cuentaId,
            tipoDeCambio: "",
            fuenteDelCambio: "",
            observaciones: "",
          },
        ),
        `el cobro de ${importe}`,
      );
    },

    async cargarEgreso(datos: DatosDeEgreso): Promise<string> {
      const resultado = await abm().crear(
        contexto.admin(),
        EGRESOS,
        conCambioSiEsEnDolares({
          fecha: datos.fecha,
          concepto: `Egreso de ${datos.importe} del ${datos.fecha}`,
          centroCostoId: datos.centroCostoId,
          proveedorId: "",
          servicioId: datos.servicioId ?? "",
          numeroComprobante: "",
          importe: datos.importe,
          importeMoneda: datos.moneda ?? "ARS",
          vencimiento: datos.vencimiento ?? "",
          observaciones: "",
          ...(datos.cambio === undefined ? {} : { cambio: datos.cambio }),
        }),
      );
      return pasa(resultado, `el egreso de ${datos.importe}`).registro.valor.id;
    },

    async pagar(
      egresoId: string,
      cuentaId: string,
      dia: string,
      importe: string,
    ): Promise<void> {
      pasa(
        await crearCasosUsoPagos(contexto.dependencias()).registrarPago(
          contexto.admin(),
          egresoId,
          {
            fecha: dia,
            importe,
            cuentaId,
            tipoDeCambio: "",
            fuenteDelCambio: "",
            observaciones: "",
          },
        ),
        `el pago de ${importe}`,
      );
    },
  };
}
