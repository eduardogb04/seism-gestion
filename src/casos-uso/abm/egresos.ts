/** Egresos (F2-03): todo lo que sale, con o sin factura, imputado a un centro de costo. */

import { z } from "zod";
import { MONEDAS } from "../../dominio/compartido/importe.ts";
import type { DefinicionAbm } from "./definicion.ts";
import { obligatorio, opcional } from "./validaciones.ts";

export const EGRESOS: DefinicionAbm<"Egreso"> = {
  entidad: "Egreso",
  singular: "egreso",
  plural: "Egresos",
  ruta: "/egresos",
  campos: {
    fecha: { tipo: "fecha", etiqueta: "Fecha" },
    concepto: { tipo: "texto", etiqueta: "Concepto" },
    centroCostoId: {
      tipo: "relacion",
      etiqueta: "Centro de costo",
      entidad: "CentroCosto",
      mostrar: "nombre",
      obligatoria: true,
      soloSi: "activo",
    },
    proveedorId: {
      tipo: "relacion",
      etiqueta: "Proveedor",
      entidad: "Cliente",
      mostrar: "razonSocial",
      soloSi: "esProveedor",
    },
    numeroComprobante: {
      tipo: "texto",
      etiqueta: "Número de comprobante",
      opcional: true,
    },
    importe: { tipo: "importe", etiqueta: "Importe" },
    vencimiento: { tipo: "fecha", etiqueta: "Vencimiento", opcional: true },
    observaciones: { tipo: "textoLargo", etiqueta: "Observaciones" },
  },
  validacion: z.object({
    fecha: z.string(),
    concepto: obligatorio("el concepto", 200),
    centroCostoId: z.string("Elegí un centro de costo."),
    proveedorId: z.string().nullable(),
    numeroComprobante: opcional(40),
    importe: z.object({
      centavos: z.bigint().positive("El importe tiene que ser mayor que cero."),
      moneda: z.enum(MONEDAS),
    }),
    vencimiento: z.string().nullable(),
    observaciones: opcional(1000),
  }),
  unicos: [],
  busqueda: ["concepto", "numeroComprobante"],
  orden: ["fecha", "importe", "concepto"],
  direccionInicial: "desc",
  filtros: ["centroCostoId", "fecha"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: [
    "fecha",
    "concepto",
    "centroCostoId",
    "proveedorId",
    "importe",
    "vencimiento",
  ],
};
