/** Egresos (F2-03): todo lo que sale, con o sin factura, imputado a un centro de costo. */

import { z } from "zod";
import { MONEDAS } from "../../dominio/compartido/importe.ts";
import { rechazosPorPagos } from "../egresos/edicion-con-pagos.ts";
import { rechazosPorServicio } from "../egresos/servicio-del-egreso.ts";
import { cambioVisible } from "./cambio.ts";
import type { DefinicionAbm } from "./definicion.ts";
import { cambioDeDocumento, obligatorio, opcional } from "./validaciones.ts";

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
    servicioId: { tipo: "servicio", etiqueta: "Servicio" },
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
    cambio: {
      tipo: "tipoDeCambio",
      etiqueta: "Tipo de cambio (pesos por dólar)",
      importe: "importe",
    },
    vencimiento: { tipo: "fecha", etiqueta: "Vencimiento", opcional: true },
    observaciones: { tipo: "textoLargo", etiqueta: "Observaciones" },
    comprobanteId: { tipo: "archivo", etiqueta: "Comprobante" },
  },
  validacion: z.object({
    fecha: z.string(),
    concepto: obligatorio("el concepto", 200),
    centroCostoId: z.string("Elegí un centro de costo."),
    servicioId: z.string().nullable(),
    proveedorId: z.string().nullable(),
    numeroComprobante: opcional(40),
    importe: z.object({
      centavos: z.bigint().positive("El importe tiene que ser mayor que cero."),
      moneda: z.enum(MONEDAS),
    }),
    cambio: cambioDeDocumento,
    vencimiento: z.string().nullable(),
    observaciones: opcional(1000),
    comprobanteId: z.string().nullable(),
  }),
  unicos: [],
  busqueda: ["concepto", "numeroComprobante"],
  orden: ["fecha", "importe", "concepto"],
  direccionInicial: "desc",
  filtros: ["centroCostoId", "fecha"],
  rolesQueEscriben: ["administrador", "operador"],
  rutaDeFila: (id) => `/egresos/${id}`,
  rechazosAlGuardar: async (repos, actual, nuevos) => ({
    ...(actual === null ? {} : await rechazosPorPagos(repos, actual, nuevos)),
    ...(await rechazosPorServicio(repos, nuevos)),
  }),
  listado: [
    "fecha",
    "concepto",
    "centroCostoId",
    "proveedorId",
    "importe",
    {
      etiqueta: "Tipo de cambio",
      de: ({ cambio, importe }) =>
        cambioVisible(cambio, importe.moneda)?.texto ?? "",
    },
    "vencimiento",
  ],
};
