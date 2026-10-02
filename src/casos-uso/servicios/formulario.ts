/**
 * El formulario de alta y edición de un servicio (F2-04, ADR 0033), con los
 * tipos de campo del molde de ABM: así lo dibuja el mismo `FormularioAbm` y lo
 * valida el mismo `validarEscrito`. El código no es un campo: lo genera el
 * sistema.
 */

import { z } from "zod";
import type { EstadoServicio } from "../../dominio/servicios/estados.ts";
import type { DatosServicio } from "../../puertos/repositorios/servicios.ts";
import type { CamposAbm, OpcionAbm } from "../abm/definicion.ts";
import { MODALIDADES } from "../abm/tipos-de-servicio.ts";
import { obligatorio, opcional } from "../abm/validaciones.ts";

export const ETIQUETAS_DE_ESTADO: Readonly<Record<EstadoServicio, string>> = {
  solicitado: "Solicitado",
  cotizado: "Cotizado",
  adjudicado: "Adjudicado",
  vigente: "Vigente",
  cerrado: "Cerrado",
  perdido: "Perdido",
  sin_respuesta: "Sin respuesta",
  cancelado: "Cancelado",
};

/**
 * Los campos, en el orden en que se muestran. El responsable es un usuario, que
 * no es un ABM: va como una lista de opciones que arma quien llama.
 */
export function camposDeServicio(
  responsables: readonly OpcionAbm[],
): CamposAbm {
  return [
    [
      "clienteId",
      {
        tipo: "relacion",
        etiqueta: "Cliente",
        entidad: "Cliente",
        mostrar: "razonSocial",
        obligatoria: true,
        soloSi: "esCliente",
      },
    ],
    [
      "tipoServicioId",
      {
        tipo: "relacion",
        etiqueta: "Tipo de servicio",
        entidad: "TipoServicio",
        mostrar: "nombre",
        obligatoria: true,
        soloSi: "activo",
      },
    ],
    ["titulo", { tipo: "texto", etiqueta: "Título" }],
    [
      "modalidad",
      { tipo: "opcion", etiqueta: "Modalidad", opciones: MODALIDADES },
    ],
    [
      "responsableId",
      { tipo: "opcion", etiqueta: "Responsable", opciones: responsables },
    ],
    ["fechaPedido", { tipo: "fecha", etiqueta: "Fecha de pedido" }],
    [
      "vigenciaDesde",
      { tipo: "fecha", etiqueta: "Vigencia desde", opcional: true },
    ],
    [
      "vigenciaHasta",
      { tipo: "fecha", etiqueta: "Vigencia hasta", opcional: true },
    ],
    ["observaciones", { tipo: "textoLargo", etiqueta: "Observaciones" }],
  ];
}

const VIGENCIAS = ["vigenciaDesde", "vigenciaHasta"] as const;

export const VALIDACION: z.ZodType<Omit<DatosServicio, "codigo">> = z
  .object({
    clienteId: z.string("Elegí un cliente."),
    tipoServicioId: z.string("Elegí un tipo de servicio."),
    titulo: obligatorio("el título", 160),
    modalidad: z.string(),
    responsableId: z.string(),
    fechaPedido: z.string(),
    vigenciaDesde: z.string().nullable(),
    vigenciaHasta: z.string().nullable(),
    observaciones: opcional(1000),
  })
  .superRefine((servicio, contexto) => {
    for (const campo of VIGENCIAS) {
      const falta =
        servicio.modalidad === "recurrente" && servicio[campo] === null;
      const sobra =
        servicio.modalidad === "puntual" && servicio[campo] !== null;
      if (falta || sobra) {
        contexto.addIssue({
          code: "custom",
          path: [campo],
          message: falta
            ? "Un servicio recurrente lleva vigencia: elegí la fecha."
            : "Un servicio puntual no lleva vigencia: dejala vacía.",
        });
      }
    }
    const { vigenciaDesde, vigenciaHasta } = servicio;
    // Dos días `aaaa-mm-dd` se comparan como texto.
    if (
      vigenciaDesde !== null &&
      vigenciaHasta !== null &&
      vigenciaHasta < vigenciaDesde
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["vigenciaHasta"],
        message: "No puede ser anterior a «Vigencia desde».",
      });
    }
  });
