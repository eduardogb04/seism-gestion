/**
 * Camiones (F1-06): uno por uno, cuelgan del cliente. Un semi con cisterna
 * lleva dos patentes (tractor y cisterna), y marca y año valen para cada una;
 * un chasis es una sola unidad. En pantalla se dice *patente*.
 */

import { z } from "zod";
import { antiguedadEnAnios } from "../../dominio/camiones/antiguedad.ts";
import type { DefinicionAbm } from "./definicion.ts";
import { obligatorio, opcional } from "./validaciones.ts";

const TIPOS = [
  { valor: "semi_con_cisterna", etiqueta: "Semi con cisterna" },
  { valor: "chasis", etiqueta: "Chasis" },
  { valor: "otro", etiqueta: "Otro" },
];

/** Como se guarda una patente: sin espacios ni guiones, en mayúsculas. */
function normalizarPatente(escrita: string): string {
  return escrita.replace(/[\s-]/g, "").toUpperCase();
}

function patente(de: string) {
  return z
    .string()
    .transform(normalizarPatente)
    .pipe(
      z
        .string()
        .min(1, `Escribí la patente ${de}.`)
        .regex(
          /^[A-Z0-9]{6,7}$/,
          "La patente tiene 6 o 7 letras y números, sin espacios ni guiones.",
        ),
    );
}

const MENSAJE_ANIO = "El año va de 1950 a 2100.";
const anio = z.number().min(1950, MENSAJE_ANIO).max(2100, MENSAJE_ANIO);

const DATOS_DE_CISTERNA = [
  ["patenteCisterna", "la patente"],
  ["marcaCisterna", "la marca"],
  ["anioCisterna", "el año de fabricación"],
] as const;

function anios(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "año" : "años"}`;
}

export const CAMIONES: DefinicionAbm<"Camion"> = {
  entidad: "Camion",
  singular: "camión",
  plural: "Camiones",
  ruta: "/catalogo/camiones",
  campos: {
    clienteId: {
      tipo: "relacion",
      etiqueta: "Cliente",
      entidad: "Cliente",
      mostrar: "razonSocial",
      obligatoria: true,
    },
    tipo: { tipo: "opcion", etiqueta: "Tipo", opciones: TIPOS },
    patenteTractor: { tipo: "texto", etiqueta: "Patente del tractor" },
    marcaTractor: { tipo: "texto", etiqueta: "Marca del tractor" },
    anioTractor: {
      tipo: "numero",
      etiqueta: "Año de fabricación del tractor",
      decimales: 0,
    },
    patenteCisterna: {
      tipo: "texto",
      etiqueta: "Patente de la cisterna",
      opcional: true,
    },
    marcaCisterna: {
      tipo: "texto",
      etiqueta: "Marca de la cisterna",
      opcional: true,
    },
    anioCisterna: {
      tipo: "numero",
      etiqueta: "Año de fabricación de la cisterna",
      decimales: 0,
      opcional: true,
    },
    capacidadLitros: {
      tipo: "numero",
      etiqueta: "Capacidad (litros)",
      decimales: 0,
    },
    observaciones: { tipo: "textoLargo", etiqueta: "Observaciones" },
  },
  validacion: z
    .object({
      clienteId: z.string("Elegí un cliente."),
      tipo: z.string(),
      patenteTractor: patente("del tractor"),
      marcaTractor: obligatorio("la marca del tractor", 60),
      anioTractor: anio,
      patenteCisterna: patente("de la cisterna").nullable(),
      marcaCisterna: opcional(60),
      anioCisterna: anio.nullable(),
      capacidadLitros: z.number().gt(0, "Tiene que ser mayor que 0."),
      observaciones: opcional(1000),
    })
    .superRefine((camion, contexto) => {
      for (const [campo, que] of DATOS_DE_CISTERNA) {
        const falta =
          camion.tipo === "semi_con_cisterna" && camion[campo] === null;
        const sobra = camion.tipo === "chasis" && camion[campo] !== null;
        if (falta || sobra) {
          contexto.addIssue({
            code: "custom",
            path: [campo],
            message: falta
              ? `Escribí ${que} de la cisterna.`
              : "Un chasis no lleva datos de cisterna.",
          });
        }
      }
    }),
  unicos: ["patenteTractor", "patenteCisterna"],
  busqueda: ["patenteTractor", "patenteCisterna", "marcaTractor"],
  orden: ["patenteTractor"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: [
    "patenteTractor",
    "patenteCisterna",
    "clienteId",
    "tipo",
    {
      etiqueta: "Antigüedad",
      de: ({ anioTractor, anioCisterna }, hoy) =>
        anios(antiguedadEnAnios(hoy, anioTractor, anioCisterna)),
    },
    "capacidadLitros",
  ],
  normalizarBusqueda: {
    patenteTractor: normalizarPatente,
    patenteCisterna: normalizarPatente,
  },
};
