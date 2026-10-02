/**
 * Clientes y proveedores (F1-04): el cliente es el nivel que factura, y puede
 * ser también proveedor. Lo que pide una factura es obligatorio; el resto se
 * completa de a poco.
 */

import { z } from "zod";
import {
  formatearCuit,
  normalizarCuit,
} from "../../dominio/compartido/cuit.ts";
import type { DefinicionAbm } from "./definicion.ts";
import { PROVINCIAS } from "./provincias.ts";
import { obligatorio, opcional } from "./validaciones.ts";

const CONDICIONES_IVA = [
  { valor: "responsable_inscripto", etiqueta: "Responsable Inscripto" },
  { valor: "monotributo", etiqueta: "Monotributo" },
  { valor: "exento", etiqueta: "Exento" },
  { valor: "consumidor_final", etiqueta: "Consumidor Final" },
  { valor: "no_alcanzado", etiqueta: "No alcanzado" },
];

const email = z.string().trim().pipe(z.email("Escribí un email válido."));

export const CLIENTES: DefinicionAbm<"Cliente"> = {
  entidad: "Cliente",
  singular: "cliente o proveedor",
  plural: "Clientes y proveedores",
  ruta: "/catalogo/clientes",
  campos: {
    razonSocial: { tipo: "texto", etiqueta: "Razón social" },
    cuit: { tipo: "texto", etiqueta: "CUIT" },
    condicionIva: {
      tipo: "opcion",
      etiqueta: "Condición frente al IVA",
      opciones: CONDICIONES_IVA,
    },
    domicilio: { tipo: "texto", etiqueta: "Calle y número" },
    localidad: { tipo: "texto", etiqueta: "Localidad" },
    provincia: { tipo: "opcion", etiqueta: "Provincia", opciones: PROVINCIAS },
    codigoPostal: { tipo: "texto", etiqueta: "Código postal" },
    esCliente: { tipo: "siNo", etiqueta: "Es cliente" },
    esProveedor: { tipo: "siNo", etiqueta: "Es proveedor" },
    nombreCorto: { tipo: "texto", etiqueta: "Nombre corto", opcional: true },
    grupoId: {
      tipo: "relacion",
      etiqueta: "Grupo",
      entidad: "Grupo",
      mostrar: "nombre",
    },
    contactoNombre: {
      tipo: "texto",
      etiqueta: "Contacto: nombre",
      opcional: true,
    },
    contactoTelefono: {
      tipo: "texto",
      etiqueta: "Contacto: teléfono",
      opcional: true,
    },
    contactoEmail: {
      tipo: "texto",
      etiqueta: "Contacto: email",
      opcional: true,
    },
    emailFacturacion: {
      tipo: "texto",
      etiqueta: "Email de facturación",
      opcional: true,
    },
    observaciones: { tipo: "textoLargo", etiqueta: "Observaciones" },
  },
  validacion: z
    .object({
      razonSocial: obligatorio("la razón social", 120),
      cuit: z.string().transform((texto, contexto) => {
        const cuit = normalizarCuit(texto);
        if (cuit === null) {
          contexto.issues.push({
            code: "custom",
            input: texto,
            message:
              "El CUIT no es válido: son 11 dígitos y el último es un verificador.",
          });
          return z.NEVER;
        }
        return cuit;
      }),
      condicionIva: z.string(),
      domicilio: obligatorio("la calle y el número", 120),
      localidad: obligatorio("la localidad", 80),
      provincia: z.string(),
      codigoPostal: z
        .string()
        .trim()
        .regex(
          /^[A-Za-z0-9]{4,8}$/,
          "El código postal tiene entre 4 y 8 letras o números.",
        )
        .transform((codigo) => codigo.toUpperCase()),
      esCliente: z.boolean(),
      esProveedor: z.boolean(),
      nombreCorto: opcional(60),
      grupoId: z.string().nullable(),
      contactoNombre: opcional(80),
      contactoTelefono: opcional(40),
      contactoEmail: email.nullable(),
      emailFacturacion: email.nullable(),
      observaciones: opcional(1000),
    })
    .refine(({ esCliente, esProveedor }) => esCliente || esProveedor, {
      path: ["esCliente"],
      message: "Marcá si es cliente, proveedor o las dos cosas.",
    }),
  unicos: ["razonSocial", "cuit"],
  busqueda: ["razonSocial", "nombreCorto", "cuit"],
  orden: ["razonSocial", "cuit"],
  rolesQueEscriben: ["administrador", "operador"],
  listado: [
    "razonSocial",
    "cuit",
    "condicionIva",
    "grupoId",
    {
      etiqueta: "Tipo",
      de: ({ esCliente, esProveedor }) =>
        esCliente && esProveedor
          ? "Cliente y proveedor"
          : esCliente
            ? "Cliente"
            : "Proveedor",
    },
  ],
  formato: { cuit: formatearCuit },
  normalizarBusqueda: { cuit: (buscado) => buscado.replace(/\D/g, "") },
};
