/** Cuentas (F2-02): por dónde pasó la plata de cada cobro y cada pago. */

import { z } from "zod";
import { MONEDAS, type Moneda } from "../../dominio/compartido/importe.ts";
import type { DefinicionAbm } from "./definicion.ts";

const ETIQUETAS_MONEDA: Readonly<Record<Moneda, string>> = {
  ARS: "Pesos",
  USD: "Dólares",
};

export const CUENTAS: DefinicionAbm<"Cuenta"> = {
  entidad: "Cuenta",
  singular: "cuenta",
  plural: "Cuentas",
  ruta: "/catalogo/cuentas",
  campos: {
    nombre: { tipo: "texto", etiqueta: "Nombre" },
    tipo: {
      tipo: "opcion",
      etiqueta: "Tipo",
      opciones: [
        { valor: "banco", etiqueta: "Banco" },
        { valor: "efectivo", etiqueta: "Efectivo" },
      ],
    },
    moneda: {
      tipo: "opcion",
      etiqueta: "Moneda",
      opciones: MONEDAS.map((valor) => ({
        valor,
        etiqueta: ETIQUETAS_MONEDA[valor],
      })),
    },
    observaciones: { tipo: "textoLargo", etiqueta: "Observaciones" },
    activa: { tipo: "siNo", etiqueta: "Activa", marcadaAlCrear: true },
  },
  validacion: z.object({
    nombre: z
      .string()
      .trim()
      .min(1, "Escribí el nombre.")
      .max(80, "El nombre no puede pasar de 80 caracteres."),
    tipo: z.string(),
    moneda: z.string(),
    observaciones: z
      .string()
      .trim()
      .max(1000, "Las observaciones no pueden pasar de 1000 caracteres.")
      .nullable(),
    activa: z.boolean(),
  }),
  unicos: ["nombre"],
  busqueda: ["nombre"],
  orden: ["nombre"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: ["nombre", "tipo", "moneda", "activa"],
};
